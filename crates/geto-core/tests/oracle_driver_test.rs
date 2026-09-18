use geto_core::db::drivers::oracle::dml;
use geto_core::db::drivers::oracle::OracleDriver;
use geto_core::db::shared::marshal::{map_oracle_type, marshal_oracle_value};
use geto_core::db::types::ColumnSpec;
use geto_core::error::AppError;
use geto_core::store::connections::{Connection, ConnectionSecret, SslMode};

#[test]
fn test_oracle_quote_ident_and_rel() {
    assert_eq!(dml::quote_ident("USERS"), "\"USERS\"");
    assert_eq!(dml::quote_ident("has\"quote"), "\"has\"\"quote\"");
    assert_eq!(dml::rel(None, "EMPLOYEES"), "\"EMPLOYEES\"");
    assert_eq!(dml::rel(Some("HR"), "EMPLOYEES"), "\"HR\".\"EMPLOYEES\"");
}

#[test]
fn test_oracle_inline_params() {
    let sql = "SELECT * FROM \"EMP\" WHERE \"DEPTNO\" = :1 AND \"SAL\" > :2";
    let params = vec![serde_json::json!(10), serde_json::json!(2500)];
    let inlined = dml::inline_params(sql, &params);
    assert_eq!(inlined, "SELECT * FROM \"EMP\" WHERE \"DEPTNO\" = 10 AND \"SAL\" > 2500");
}

#[test]
fn test_oracle_build_insert_and_update() {
    let mut values = serde_json::Map::new();
    values.insert("NAME".to_string(), serde_json::json!("Alice"));
    values.insert("AGE".to_string(), serde_json::json!(30));

    let (insert_sql, insert_params) = dml::build_insert(Some("HR"), "USERS", &values);
    assert!(insert_sql.contains("INSERT INTO \"HR\".\"USERS\""));
    assert!(insert_sql.contains("VALUES (:1, :2)"));
    assert_eq!(insert_params.len(), 2);

    let mut pk = serde_json::Map::new();
    pk.insert("ID".to_string(), serde_json::json!(101));

    let (update_sql, update_params) = dml::build_update(Some("HR"), "USERS", &pk, &values).unwrap();
    assert!(update_sql.contains("UPDATE \"HR\".\"USERS\" SET"));
    assert!(update_sql.contains("WHERE \"ID\" = :3"));
    assert_eq!(update_params.len(), 3);
}

#[test]
fn test_oracle_build_create_table() {
    let columns = vec![
        ColumnSpec {
            name: "ID".to_string(),
            r#type: "INTEGER".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(true),
        },
        ColumnSpec {
            name: "NAME".to_string(),
            r#type: "TEXT".to_string(),
            not_null: Some(false),
            default: None,
            primary_key: Some(false),
        },
    ];

    let ddl = dml::build_create_table(Some("APP"), "PRODUCTS", &columns).unwrap();
    assert!(ddl.contains("CREATE TABLE \"APP\".\"PRODUCTS\""));
    assert!(ddl.contains("\"ID\" NUMBER(38) NOT NULL"));
    assert!(ddl.contains("\"NAME\" VARCHAR2(4000)"));
    assert!(ddl.contains("PRIMARY KEY (\"ID\")"));
}

#[test]
fn test_oracle_marshal_type_and_value() {
    let (t_id, t_name) = map_oracle_type(oracle_rs::OracleType::Varchar);
    assert_eq!(t_id, 253);
    assert_eq!(t_name, "varchar2");

    let val_null = marshal_oracle_value(&oracle_rs::Value::Null);
    assert_eq!(val_null, serde_json::Value::Null);

    let val_str = marshal_oracle_value(&oracle_rs::Value::String("Oracle DB".to_string()));
    assert_eq!(val_str, serde_json::json!("Oracle DB"));

    let val_bool = marshal_oracle_value(&oracle_rs::Value::Boolean(true));
    assert_eq!(val_bool, serde_json::json!(true));

    let val_int = marshal_oracle_value(&oracle_rs::Value::Integer(42));
    assert_eq!(val_int, serde_json::json!(42));
}

#[tokio::test]
async fn test_oracle_connect_unreachable_host() {
    let secret = ConnectionSecret {
        connection: Connection {
            id: "test-oracle".to_string(),
            name: "Test Oracle".to_string(),
            provider: "oracle".to_string(),
            host: "127.0.0.1".to_string(),
            port: 59996,
            database: "FREEPDB1".to_string(),
            username: "system".to_string(),
            has_password: true,
            ssl_mode: SslMode::Disable,
            color: None,
            readonly: false,
            ssh: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        },
        password: Some("secret".to_string()),
        ssh_secret: None,
    };

    let res = OracleDriver::connect(&secret).await;
    match res {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("Failed to connect to Oracle database"),
                "Expected connection failure message, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got: {:?}", other.map(|_| ())),
    }
}

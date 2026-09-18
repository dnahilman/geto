use geto_core::db::drivers::postgres::dml;
use geto_core::db::drivers::postgres::PostgresDriver;
use geto_core::db::types::ColumnSpec;
use geto_core::error::AppError;
use geto_core::store::connections::{Connection, ConnectionSecret, SslMode};

#[test]
fn test_postgres_quote_ident_and_rel() {
    assert_eq!(dml::quote_ident("users"), "\"users\"");
    assert_eq!(dml::quote_ident("has\"quote"), "\"has\"\"quote\"");
    assert_eq!(dml::rel(None, "items"), "\"items\"");
    assert_eq!(dml::rel(Some("public"), "items"), "\"public\".\"items\"");
}

#[test]
fn test_postgres_inline_params() {
    let sql = "SELECT * FROM \"users\" WHERE \"id\" = $1 AND \"status\" = $2";
    let params = vec![serde_json::json!(42), serde_json::json!("active")];
    let inlined = dml::inline_params(sql, &params);
    assert_eq!(inlined, "SELECT * FROM \"users\" WHERE \"id\" = 42 AND \"status\" = 'active'");
}

#[test]
fn test_postgres_build_insert_and_update() {
    let mut values = serde_json::Map::new();
    values.insert("name".to_string(), serde_json::json!("Bob"));
    values.insert("age".to_string(), serde_json::json!(28));

    let (insert_sql, insert_params) = dml::build_insert(Some("public"), "users", &values);
    assert!(insert_sql.contains("INSERT INTO \"public\".\"users\""));
    assert!(insert_sql.contains("RETURNING *"));
    assert_eq!(insert_params.len(), 2);

    let mut pk = serde_json::Map::new();
    pk.insert("id".to_string(), serde_json::json!(1));

    let (update_sql, update_params) = dml::build_update(Some("public"), "users", &pk, &values).unwrap();
    assert!(update_sql.contains("UPDATE \"public\".\"users\" SET"));
    assert!(update_sql.contains("WHERE \"id\" = $3"));
    assert!(update_sql.contains("RETURNING *"));
    assert_eq!(update_params.len(), 3);
}

#[test]
fn test_postgres_build_create_table() {
    let columns = vec![
        ColumnSpec {
            name: "id".to_string(),
            r#type: "SERIAL".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(true),
        },
        ColumnSpec {
            name: "email".to_string(),
            r#type: "VARCHAR(255)".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(false),
        },
    ];

    let ddl = dml::build_create_table(Some("public"), "accounts", &columns).unwrap();
    assert!(ddl.contains("CREATE TABLE \"public\".\"accounts\""));
    assert!(ddl.contains("\"id\" SERIAL NOT NULL"));
    assert!(ddl.contains("\"email\" VARCHAR(255) NOT NULL"));
    assert!(ddl.contains("PRIMARY KEY (\"id\")"));
}

#[tokio::test]
async fn test_postgres_connect_unreachable_host() {
    let secret = ConnectionSecret {
        connection: Connection {
            id: "test-pg".to_string(),
            name: "Test Postgres".to_string(),
            provider: "postgresql".to_string(),
            host: "127.0.0.1".to_string(),
            port: 59995,
            database: "postgres".to_string(),
            username: "postgres".to_string(),
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

    let res = PostgresDriver::connect(&secret).await;
    match res {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("Failed to connect to PostgreSQL"),
                "Expected PG connection failure, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got: {:?}", other.map(|_| ())),
    }
}

use geto_core::db::drivers::mysql::dml;
use geto_core::db::drivers::mysql::MySqlDriver;
use geto_core::db::types::ColumnSpec;
use geto_core::error::AppError;
use geto_core::store::connections::{Connection, ConnectionSecret, SslMode};

#[test]
fn test_mysql_quote_ident_and_rel() {
    assert_eq!(dml::quote_ident("users"), "`users`");
    assert_eq!(dml::quote_ident("has`quote"), "`has``quote`");
    assert_eq!(dml::rel(None, "orders"), "`orders`");
    assert_eq!(dml::rel(Some("shop"), "orders"), "`shop`.`orders`");
}

#[test]
fn test_mysql_inline_params() {
    let sql = "SELECT * FROM `users` WHERE `id` = ? AND `status` = ?";
    let params = vec![serde_json::json!(42), serde_json::json!("active")];
    let inlined = dml::inline_params(sql, &params);
    assert_eq!(inlined, "SELECT * FROM `users` WHERE `id` = 42 AND `status` = 'active'");
}

#[test]
fn test_mysql_build_insert_and_update() {
    let mut values = serde_json::Map::new();
    values.insert("name".to_string(), serde_json::json!("Charlie"));
    values.insert("age".to_string(), serde_json::json!(35));

    let (insert_sql, insert_params) = dml::build_insert(Some("shop"), "users", &values);
    assert!(insert_sql.contains("INSERT INTO `shop`.`users`"));
    assert!(insert_sql.contains("VALUES (?, ?)"));
    assert_eq!(insert_params.len(), 2);

    let mut pk = serde_json::Map::new();
    pk.insert("id".to_string(), serde_json::json!(1));

    let (update_sql, update_params) = dml::build_update(Some("shop"), "users", &pk, &values).unwrap();
    assert!(update_sql.contains("UPDATE `shop`.`users` SET"));
    assert!(update_sql.contains("WHERE `id` = ?"));
    assert_eq!(update_params.len(), 3);
}

#[test]
fn test_mysql_build_create_table() {
    let columns = vec![
        ColumnSpec {
            name: "id".to_string(),
            r#type: "INT AUTO_INCREMENT".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(true),
        },
        ColumnSpec {
            name: "title".to_string(),
            r#type: "VARCHAR(255)".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(false),
        },
    ];

    let ddl = dml::build_create_table(Some("shop"), "posts", &columns).unwrap();
    assert!(ddl.contains("CREATE TABLE `shop`.`posts`"));
    assert!(ddl.contains("`id` INT AUTO_INCREMENT NOT NULL"));
    assert!(ddl.contains("`title` VARCHAR(255) NOT NULL"));
    assert!(ddl.contains("PRIMARY KEY (`id`)"));
}

#[tokio::test]
async fn test_mysql_connect_unreachable_host() {
    let secret = ConnectionSecret {
        connection: Connection {
            id: "test-mysql".to_string(),
            name: "Test MySQL".to_string(),
            provider: "mysql".to_string(),
            host: "127.0.0.1".to_string(),
            port: 59994,
            database: "testdb".to_string(),
            username: "root".to_string(),
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

    let res = MySqlDriver::connect(&secret).await;
    match res {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("pool timed out")
                    || msg.contains("connection refused")
                    || msg.contains("Failed to connect"),
                "Expected MySQL connection or timeout failure, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got: {:?}", other.map(|_| ())),
    }
}

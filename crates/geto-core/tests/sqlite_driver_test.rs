use geto_core::db::driver::DbDriver;
use geto_core::db::drivers::sqlite::SqliteDriver;
use geto_core::db::types::{ColumnSpec, TableDataOptions, TableFilterGroup, TableFilterRule};
use geto_core::store::connections::{Connection, ConnectionSecret, SslMode};
use serde_json::json;

#[tokio::test]
async fn test_sqlite_driver_lifecycle_and_crud() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let db_file = temp_dir.path().join("test.db");
    let db_path = db_file.to_str().unwrap().to_string();

    let secret = ConnectionSecret {
        connection: Connection {
            id: "conn-sqlite-1".to_string(),
            name: "Test SQLite".to_string(),
            provider: "sqlite".to_string(),
            host: "".to_string(),
            port: 0,
            database: db_path.clone(),
            username: "".to_string(),
            has_password: false,
            ssl_mode: SslMode::Disable,
            color: None,
            readonly: false,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            ssh: None,
        },
        password: None,
        ssh_secret: None,
    };

    // 1. Connect
    let driver = SqliteDriver::connect(&secret).await.expect("failed to connect to sqlite");
    assert_eq!(driver.id(), "sqlite");

    let caps = driver.capabilities();
    assert_eq!(caps.connection_shape, "file");
    assert!(caps.supports_returning);

    // 2. Introspect empty database
    let schemas = driver.list_schemas().await.expect("list schemas");
    assert!(schemas.contains(&"main".to_string()));

    let tree = driver.get_tree(None).await.expect("get tree");
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].schema, "main");

    // 3. Create table
    let columns = vec![
        ColumnSpec {
            name: "id".to_string(),
            r#type: "INTEGER".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(true),
        },
        ColumnSpec {
            name: "name".to_string(),
            r#type: "TEXT".to_string(),
            not_null: Some(true),
            default: None,
            primary_key: Some(false),
        },
        ColumnSpec {
            name: "score".to_string(),
            r#type: "REAL".to_string(),
            not_null: Some(false),
            default: Some("0.0".to_string()),
            primary_key: Some(false),
        },
    ];

    let create_sql = driver.create_table(None, "users", &columns).await.expect("create table");
    assert!(create_sql.contains("CREATE TABLE \"users\""));

    // 4. Introspect created table
    let tree_after = driver.get_tree(None).await.expect("get tree after create");
    assert_eq!(tree_after[0].relations.len(), 1);
    assert_eq!(tree_after[0].relations[0].name, "users");

    let cols = driver.get_columns(None, "users").await.expect("get columns");
    assert_eq!(cols.len(), 3);
    assert_eq!(cols[0].name, "id");
    assert!(cols[0].is_primary_key);
    assert!(cols[0].not_null);
    assert_eq!(cols[1].name, "name");
    assert_eq!(cols[2].name, "score");

    // 5. Insert rows
    let mut val1 = serde_json::Map::new();
    val1.insert("id".to_string(), json!(1));
    val1.insert("name".to_string(), json!("Alice"));
    val1.insert("score".to_string(), json!(95.5));
    let (ins_res, _sql) = driver.insert_row(None, "users", &val1).await.expect("insert row 1");
    assert_eq!(ins_res.row_count, 1);

    let mut val2 = serde_json::Map::new();
    val2.insert("id".to_string(), json!(2));
    val2.insert("name".to_string(), json!("Bob"));
    val2.insert("score".to_string(), json!(82.0));
    driver.insert_row(None, "users", &val2).await.expect("insert row 2");

    // 6. Query data with TableDataOptions & filter
    let data = driver
        .get_table_data(
            None,
            "users",
            TableDataOptions {
                limit: 10,
                offset: 0,
                order_by: Some("name".to_string()),
                order_dir: Some("ASC".to_string()),
                filter_column: None,
                filter_value: None,
                filter_group: Some(TableFilterGroup {
                    conjunction: "AND".to_string(),
                    rules: vec![TableFilterRule {
                        column: "score".to_string(),
                        operator: "greater_than".to_string(),
                        value: Some("90".to_string()),
                    }],
                }),
            },
        )
        .await
        .expect("get table data");

    assert_eq!(data.row_count, 1);
    assert_eq!(data.rows[0][1], json!("Alice"));

    // 7. Update row
    let mut pk = serde_json::Map::new();
    pk.insert("id".to_string(), json!(2));
    let mut update_vals = serde_json::Map::new();
    update_vals.insert("name".to_string(), json!("Robert"));
    update_vals.insert("score".to_string(), json!(88.5));

    let (upd_res, _) = driver.update_row(None, "users", &pk, &update_vals).await.expect("update row");
    assert_eq!(upd_res.row_count, 1);

    // 8. Delete row
    let (del_res, _) = driver.delete_row(None, "users", &pk).await.expect("delete row");
    assert_eq!(del_res.row_count, 1);

    // 9. Truncate (DELETE FROM)
    let trunc_res = driver.truncate_table(None, "users").await.expect("truncate table");
    assert!(trunc_res.contains("DELETE FROM \"users\""));

    let data_empty = driver
        .get_table_data(
            None,
            "users",
            TableDataOptions {
                limit: 10,
                offset: 0,
                order_by: None,
                order_dir: None,
                filter_column: None,
                filter_value: None,
                filter_group: None,
            },
        )
        .await
        .expect("get data empty");
    assert_eq!(data_empty.row_count, 0);

    // 10. Drop table
    driver.drop_table(None, "users").await.expect("drop table");

    let tree_dropped = driver.get_tree(None).await.expect("tree dropped");
    assert_eq!(tree_dropped[0].relations.len(), 0);

    // 11. Completion
    let comp = driver.get_completion().await.expect("completion");
    assert!(comp.functions.iter().any(|f| f.name == "sqlite_version" || f.name == "strftime"));

    driver.close().await;
}

#[tokio::test]
async fn test_sqlite_connection_service_and_registry() {
    use geto_core::crypto::SecretCipher;
    use geto_core::db::registry::DriverRegistry;
    use geto_core::services::connections::{build_connection_string, run_ping_test};
    use geto_core::store::connections::create_connection;
    use geto_core::store::db::init_db;

    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let pool = init_db(temp_dir.path()).await.expect("init db");
    let cipher = SecretCipher::new("test-key-for-sqlite");

    let test_db_path = temp_dir.path().join("service_test.db");
    let db_path_str = test_db_path.to_str().unwrap().to_string();

    // 1. run_ping_test
    let (ver, _latency) = run_ping_test("sqlite", "", 0, &db_path_str, "", None, SslMode::Disable)
        .await
        .expect("ping test");
    assert!(ver.starts_with("SQLite"));

    // 2. build_connection_string
    let conn_str = build_connection_string("sqlite", "", 0, &db_path_str, "", None, SslMode::Disable);
    assert_eq!(conn_str, format!("sqlite://{}", db_path_str));

    // 3. create_connection & registry resolution
    let input = geto_core::store::connections::ConnectionInput {
        name: "Test SQLite".to_string(),
        provider: "sqlite".to_string(),
        host: "".to_string(),
        port: 0,
        database: db_path_str.clone(),
        username: "".to_string(),
        password: None,
        ssl_mode: SslMode::Disable,
        color: None,
        readonly: false,
        ssh: None,
    };
    let conn = create_connection(&pool, &cipher, input).await.expect("create conn");
    let registry = DriverRegistry::new();
    let drv = registry.get_driver_direct(&pool, &cipher, &conn.id).await.expect("get driver direct");
    assert_eq!(drv.id(), "sqlite");

    let schemas = drv.list_schemas().await.expect("list schemas");
    assert!(schemas.contains(&"main".to_string()));
}

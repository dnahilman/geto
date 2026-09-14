use geto_core::crypto::SecretCipher;
use geto_core::store::connections::{
    create_connection, delete_connection, get_connection, get_connection_secret,
    list_connections, update_connection, ConnectionInput, SslMode,
};
use geto_core::store::db::init_db;
use geto_core::store::history::{list_history, record_history, NewHistoryEntry};
use sqlx::Row;

#[tokio::test]
async fn test_init_db_creates_tables() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let pool = init_db(temp_dir.path())
        .await
        .expect("failed to initialize sqlite db");

    // Verify connections and query_history tables are created
    let rows: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
    )
    .fetch_all(&pool)
    .await
    .expect("failed to query sqlite_master");

    assert!(rows.contains(&"connections".to_string()));
    assert!(rows.contains(&"query_history".to_string()));
}

#[tokio::test]
async fn test_connection_crud_and_encryption() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let pool = init_db(temp_dir.path())
        .await
        .expect("failed to initialize sqlite db");

    let cipher = SecretCipher::new("test-master-key-xyz");

    // 1. Create connection
    let input = ConnectionInput {
        name: "Test PostgreSQL".to_string(),
        provider: "postgresql".to_string(),
        host: "localhost".to_string(),
        port: 5432,
        database: "test_db".to_string(),
        username: "postgres".to_string(),
        password: Some("SuperSecretPass123!".to_string()),
        ssl_mode: SslMode::Prefer,
        color: Some("#3b82f6".to_string()),
        readonly: false,
        ssh: None,
    };

    let created = create_connection(&pool, &cipher, input)
        .await
        .expect("failed to create connection");

    assert_eq!(created.name, "Test PostgreSQL");
    assert_eq!(created.provider, "postgresql");
    assert_eq!(created.host, "localhost");
    assert_eq!(created.port, 5432);
    assert_eq!(created.database, "test_db");
    assert_eq!(created.username, "postgres");

    // Verify stored password in SQLite is encrypted (starts with v1:)
    let stored_enc_pwd: Option<String> = sqlx::query("SELECT password_enc FROM connections WHERE id = ?")
        .bind(&created.id)
        .fetch_one(&pool)
        .await
        .expect("failed to query password_enc")
        .try_get(0)
        .expect("failed to get password_enc column");

    assert!(stored_enc_pwd.is_some());
    assert!(stored_enc_pwd.unwrap().starts_with("v1:"));

    // 2. Get connection and decrypt secret
    let secret = get_connection_secret(&pool, &cipher, &created.id)
        .await
        .expect("failed to fetch secret")
        .expect("connection not found");

    assert_eq!(secret.connection.id, created.id);
    assert_eq!(secret.password.as_deref(), Some("SuperSecretPass123!"));

    // 3. List connections
    let connections = list_connections(&pool)
        .await
        .expect("failed to list connections");
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0].id, created.id);

    // 4. Update connection
    let update_input = ConnectionInput {
        name: "Updated PostgreSQL".to_string(),
        provider: "postgresql".to_string(),
        host: "127.0.0.1".to_string(),
        port: 5433,
        database: "updated_db".to_string(),
        username: "admin".to_string(),
        password: Some("NewPass456!".to_string()),
        ssl_mode: SslMode::Require,
        color: Some("#ef4444".to_string()),
        readonly: true,
        ssh: None,
    };

    let updated = update_connection(&pool, &cipher, &created.id, update_input)
        .await
        .expect("failed to update connection")
        .expect("connection not found");

    assert_eq!(updated.name, "Updated PostgreSQL");
    assert_eq!(updated.host, "127.0.0.1");
    assert_eq!(updated.port, 5433);
    assert!(updated.readonly);

    // Verify decrypted password after update
    let updated_secret = get_connection_secret(&pool, &cipher, &created.id)
        .await
        .expect("failed to fetch secret after update")
        .expect("connection not found");

    assert_eq!(updated_secret.password.as_deref(), Some("NewPass456!"));

    // 5. Delete connection
    let deleted = delete_connection(&pool, &created.id)
        .await
        .expect("failed to delete connection");
    assert!(deleted);

    let retrieved_after_del = get_connection(&pool, &created.id)
        .await
        .expect("failed to query after deletion");
    assert!(retrieved_after_del.is_none());
}

#[tokio::test]
async fn test_query_history_and_cascade_delete() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let pool = init_db(temp_dir.path())
        .await
        .expect("failed to initialize sqlite db");

    let cipher = SecretCipher::new("test-master-key-xyz");

    let input = ConnectionInput {
        name: "History Conn".to_string(),
        provider: "postgresql".to_string(),
        host: "localhost".to_string(),
        port: 5432,
        database: "db".to_string(),
        username: "user".to_string(),
        password: None,
        ssl_mode: SslMode::Prefer,
        color: None,
        readonly: false,
        ssh: None,
    };

    let conn = create_connection(&pool, &cipher, input)
        .await
        .expect("failed to create connection");

    // 1. Record query history entries
    let entry1 = record_history(
        &pool,
        NewHistoryEntry {
            connection_id: conn.id.clone(),
            sql: "SELECT 1;".to_string(),
            started_at: "2026-09-14T10:00:00Z".to_string(),
            duration_ms: Some(15),
            row_count: Some(1),
            status: "success".to_string(),
            error: None,
        },
    )
    .await
    .expect("failed to record history 1");

    let entry2 = record_history(
        &pool,
        NewHistoryEntry {
            connection_id: conn.id.clone(),
            sql: "SELECT * FROM users;".to_string(),
            started_at: "2026-09-14T10:01:00Z".to_string(),
            duration_ms: Some(42),
            row_count: Some(10),
            status: "success".to_string(),
            error: None,
        },
    )
    .await
    .expect("failed to record history 2");

    assert!(!entry1.id.is_empty());
    assert!(!entry2.id.is_empty());

    // 2. List query history
    let history = list_history(&pool, &conn.id, 10)
        .await
        .expect("failed to list history");
    assert_eq!(history.len(), 2);

    // 3. Delete connection and test cascade delete
    delete_connection(&pool, &conn.id)
        .await
        .expect("failed to delete connection");

    let history_after_conn_del = list_history(&pool, &conn.id, 10)
        .await
        .expect("failed to list history after delete");
    assert_eq!(history_after_conn_del.len(), 0);
}

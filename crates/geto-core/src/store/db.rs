use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::fs;
use std::path::Path;
use std::str::FromStr;

pub async fn init_db(data_dir: &Path) -> Result<SqlitePool, Box<dyn std::error::Error + Send + Sync>> {
    fs::create_dir_all(data_dir)?;
    let db_path = data_dir.join("geto.sqlite");

    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    // Base tables schema
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            provider     TEXT NOT NULL DEFAULT 'postgresql',
            host         TEXT NOT NULL,
            port         INTEGER NOT NULL DEFAULT 5432,
            database     TEXT NOT NULL,
            username     TEXT NOT NULL,
            password_enc TEXT,
            ssl_mode     TEXT NOT NULL DEFAULT 'prefer',
            color        TEXT,
            readonly     INTEGER NOT NULL DEFAULT 0,
            ssh_enabled  INTEGER NOT NULL DEFAULT 0,
            ssh_host     TEXT,
            ssh_port     INTEGER NOT NULL DEFAULT 22,
            ssh_username TEXT,
            ssh_auth     TEXT NOT NULL DEFAULT 'key',
            ssh_password_enc TEXT,
            ssh_key_enc TEXT,
            ssh_passphrase_enc TEXT,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS query_history (
            id            TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            sql           TEXT NOT NULL,
            started_at    TEXT NOT NULL,
            duration_ms   INTEGER,
            row_count     INTEGER,
            status        TEXT NOT NULL,
            error         TEXT,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_history_conn
            ON query_history(connection_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS saved_queries (
            id            TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            name          TEXT NOT NULL,
            sql           TEXT NOT NULL,
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        );
        "#,
    )
    .execute(&pool)
    .await?;

    // Optional column migrations
    let migrations = [
        "ALTER TABLE connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'postgresql'",
        "ALTER TABLE connections ADD COLUMN ssh_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE connections ADD COLUMN ssh_host TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_port INTEGER NOT NULL DEFAULT 22",
        "ALTER TABLE connections ADD COLUMN ssh_username TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_auth TEXT NOT NULL DEFAULT 'key'",
        "ALTER TABLE connections ADD COLUMN ssh_password_enc TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_key_enc TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_passphrase_enc TEXT",
    ];

    for migration in migrations {
        let _ = sqlx::query(migration).execute(&pool).await;
    }

    Ok(pool)
}

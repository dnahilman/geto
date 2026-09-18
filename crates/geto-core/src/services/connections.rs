use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::crypto::SecretCipher;
use crate::db::DriverRegistry;
use crate::db::ssh::SshTunnel;
use crate::error::AppError;
use crate::store::connections::{
    create_connection as store_create, delete_connection as store_delete,
    get_connection as store_get, get_connection_secret, list_connections as store_list,
    set_connection_database as store_set_db, update_connection as store_update, Connection,
    ConnectionInput, SshSecret, SslMode,
};

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct SetDatabaseInput {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DeleteResponse {
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStringResponse {
    pub connection_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Helper function to ping a database using temporary connection options.
pub async fn run_ping_test(
    provider: &str,
    host: &str,
    port: i32,
    database: &str,
    username: &str,
    password: Option<&str>,
    ssl_mode: SslMode,
) -> Result<(String, u64), String> {
    let t0 = Instant::now();

    match provider {
        "mysql" => {
            let ssl = match ssl_mode {
                SslMode::Disable => sqlx::mysql::MySqlSslMode::Disabled,
                SslMode::Require => sqlx::mysql::MySqlSslMode::Required,
                SslMode::VerifyCa => sqlx::mysql::MySqlSslMode::VerifyCa,
                SslMode::VerifyFull => sqlx::mysql::MySqlSslMode::VerifyIdentity,
                _ => sqlx::mysql::MySqlSslMode::Preferred,
            };

            let mut opts = sqlx::mysql::MySqlConnectOptions::new()
                .host(host)
                .port(port as u16)
                .username(username)
                .ssl_mode(ssl);

            if let Some(pwd) = password {
                opts = opts.password(pwd);
            }
            if !database.is_empty() {
                opts = opts.database(database);
            }

            let pool = sqlx::mysql::MySqlPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(10))
                .connect_with(opts)
                .await
                .map_err(|e| e.to_string())?;

            let row = sqlx::query("SELECT VERSION() AS version")
                .fetch_one(&pool)
                .await
                .map_err(|e| e.to_string())?;

            use sqlx::Row;
            let version: String = row.try_get("version").unwrap_or_else(|_| "MySQL".to_string());
            let latency = t0.elapsed().as_millis() as u64;
            Ok((version, latency))
        }
        "postgresql" => {
            let ssl = match ssl_mode {
                SslMode::Disable => sqlx::postgres::PgSslMode::Disable,
                SslMode::Require => sqlx::postgres::PgSslMode::Require,
                SslMode::VerifyCa => sqlx::postgres::PgSslMode::VerifyCa,
                SslMode::VerifyFull => sqlx::postgres::PgSslMode::VerifyFull,
                _ => sqlx::postgres::PgSslMode::Prefer,
            };

            let mut opts = sqlx::postgres::PgConnectOptions::new()
                .host(host)
                .port(port as u16)
                .username(username)
                .ssl_mode(ssl);

            if let Some(pwd) = password {
                opts = opts.password(pwd);
            }
            if !database.is_empty() {
                opts = opts.database(database);
            }

            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(10))
                .connect_with(opts)
                .await
                .map_err(|e| e.to_string())?;

            let row = sqlx::query("SELECT VERSION() AS version")
                .fetch_one(&pool)
                .await
                .map_err(|e| e.to_string())?;

            use sqlx::Row;
            let version: String = row.try_get("version").unwrap_or_else(|_| "PostgreSQL".to_string());
            let latency = t0.elapsed().as_millis() as u64;
            Ok((version, latency))
        }
        "sqlite" | "sqlite3" => {
            let raw_path = database.trim();
            let db_path = if raw_path.is_empty() {
                ":memory:"
            } else {
                raw_path.strip_prefix("sqlite://").unwrap_or(raw_path)
            };

            let opts = if db_path == ":memory:" {
                sqlx::sqlite::SqliteConnectOptions::new().in_memory(true)
            } else {
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(db_path)
                    .create_if_missing(true)
            };

            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(10))
                .connect_with(opts)
                .await
                .map_err(|e| e.to_string())?;

            let row = sqlx::query("SELECT sqlite_version() AS version")
                .fetch_one(&pool)
                .await
                .map_err(|e| e.to_string())?;

            use sqlx::Row;
            let ver: String = row.try_get("version").unwrap_or_else(|_| "unknown".to_string());
            let version = format!("SQLite {}", ver);
            let latency = t0.elapsed().as_millis() as u64;
            Ok((version, latency))
        }
        "oracle" | "orcl" => {
            let p = if port > 0 { port as u16 } else { 1521 };
            let db = if database.is_empty() { "FREEPDB1" } else { database };
            let pwd = password.unwrap_or_default();
            let mut config = oracle_rs::Config::new(host, p, db, username, pwd);
            if ssl_mode == SslMode::Require
                || ssl_mode == SslMode::VerifyCa
                || ssl_mode == SslMode::VerifyFull
            {
                if let Ok(cfg_tls) = config.clone().with_tls() {
                    config = cfg_tls;
                }
            }

            let conn = oracle_rs::Connection::connect_with_config(config)
                .await
                .map_err(|e| e.to_string())?;

            let qr = conn
                .query("SELECT banner FROM v$version WHERE ROWNUM = 1", &[])
                .await
                .map_err(|e| e.to_string())?;

            let ver = qr
                .rows
                .first()
                .and_then(|r| r.get(0).and_then(|v| v.as_str()))
                .unwrap_or("Oracle Database");

            let latency = t0.elapsed().as_millis() as u64;
            let _ = conn.close().await;
            Ok((ver.to_string(), latency))
        }
        other => Err(format!("Unsupported provider: {}", other)),
    }
}

/// Helper function to build a connection string URL.
pub fn build_connection_string(
    provider: &str,
    host: &str,
    port: i32,
    database: &str,
    username: &str,
    password: Option<&str>,
    ssl_mode: SslMode,
) -> String {
    if provider == "sqlite" || provider == "sqlite3" {
        return format!("sqlite://{}", database);
    }

    let auth = match password {
        Some(pwd) if !pwd.is_empty() => format!("{}:{}@", username, pwd),
        _ => {
            if username.is_empty() {
                "".to_string()
            } else {
                format!("{}@", username)
            }
        }
    };

    if provider == "oracle" || provider == "orcl" {
        return format!("oracle://{}{}:{}/{}", auth, host, port, database);
    }

    let scheme = if provider == "mysql" { "mysql" } else { "postgresql" };
    let mut url = format!("{}://{}{}:{}/{}", scheme, auth, host, port, database);

    if ssl_mode != SslMode::Prefer && ssl_mode != SslMode::Disable {
        let param = if provider == "mysql" { "ssl-mode" } else { "sslmode" };
        url.push_str(&format!("?{}={}", param, ssl_mode.as_str()));
    }

    url
}

/// List all stored connections.
pub async fn list_connections(pool: &sqlx::SqlitePool) -> Result<Vec<Connection>, AppError> {
    store_list(pool).await
}

/// Create a new connection and store its credentials encrypted.
pub async fn create_connection(
    pool: &sqlx::SqlitePool,
    cipher: &SecretCipher,
    input: ConnectionInput,
) -> Result<Connection, AppError> {
    store_create(pool, cipher, input).await
}

/// Get a single connection by ID.
pub async fn get_connection(
    pool: &sqlx::SqlitePool,
    id: &str,
) -> Result<Option<Connection>, AppError> {
    store_get(pool, id).await
}

/// Update an existing connection.
pub async fn update_connection(
    pool: &sqlx::SqlitePool,
    cipher: &SecretCipher,
    id: &str,
    input: ConnectionInput,
) -> Result<Option<Connection>, AppError> {
    store_update(pool, cipher, id, input).await
}

/// Delete a connection and close cached driver if open.
pub async fn delete_connection(
    pool: &sqlx::SqlitePool,
    registry: &DriverRegistry,
    id: &str,
) -> Result<bool, AppError> {
    let deleted = store_delete(pool, id).await?;
    if deleted {
        registry.close_driver(id).await;
    }
    Ok(deleted)
}

/// Set active database for a connection.
pub async fn set_connection_database(
    pool: &sqlx::SqlitePool,
    registry: &DriverRegistry,
    id: &str,
    database: &str,
) -> Result<Option<Connection>, AppError> {
    let conn = store_set_db(pool, id, database).await?;
    registry.close_driver(id).await;
    Ok(conn)
}

/// Test connection with unsaved input parameters.
pub async fn test_unsaved_connection(input: &ConnectionInput) -> TestResult {
    let (_tunnel, host, port) = if let Some(ssh) = &input.ssh {
        if ssh.enabled {
            let ssh_sec = SshSecret {
                host: ssh.host.clone(),
                port: ssh.port,
                username: ssh.username.clone(),
                auth_method: ssh.auth_method,
                password: ssh.password.clone(),
                private_key: ssh.private_key.clone(),
                passphrase: ssh.passphrase.clone(),
            };
            match SshTunnel::start(&ssh_sec, &input.host, input.port as u16).await {
                Ok(tun) => {
                    let p = tun.local_port as i32;
                    (Some(tun), "127.0.0.1".to_string(), p)
                }
                Err(err) => {
                    return TestResult {
                        version: None,
                        latency_ms: None,
                        error: Some(format!("SSH tunnel error: {}", err)),
                    };
                }
            }
        } else {
            (None, input.host.clone(), input.port)
        }
    } else {
        (None, input.host.clone(), input.port)
    };

    match run_ping_test(
        &input.provider,
        &host,
        port,
        &input.database,
        &input.username,
        input.password.as_deref(),
        input.ssl_mode,
    )
    .await
    {
        Ok((version, latency_ms)) => TestResult {
            version: Some(version),
            latency_ms: Some(latency_ms),
            error: None,
        },
        Err(err) => TestResult {
            version: None,
            latency_ms: None,
            error: Some(err),
        },
    }
}

/// Test connection using saved credentials from SQLite.
pub async fn test_saved_connection(
    pool: &sqlx::SqlitePool,
    cipher: &SecretCipher,
    id: &str,
) -> Result<TestResult, AppError> {
    let secret = get_connection_secret(pool, cipher, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Connection not found".to_string()))?;

    let conn = secret.connection;
    let (_tunnel, host, port) = if let (Some(ssh_conf), Some(ssh_sec)) = (&conn.ssh, &secret.ssh_secret) {
        if ssh_conf.enabled {
            match SshTunnel::start(ssh_sec, &conn.host, conn.port as u16).await {
                Ok(tun) => {
                    let p = tun.local_port as i32;
                    (Some(tun), "127.0.0.1".to_string(), p)
                }
                Err(err) => {
                    return Ok(TestResult {
                        version: None,
                        latency_ms: None,
                        error: Some(format!("SSH tunnel error: {}", err)),
                    });
                }
            }
        } else {
            (None, conn.host.clone(), conn.port)
        }
    } else {
        (None, conn.host.clone(), conn.port)
    };

    let res = match run_ping_test(
        &conn.provider,
        &host,
        port,
        &conn.database,
        &conn.username,
        secret.password.as_deref(),
        conn.ssl_mode,
    )
    .await
    {
        Ok((version, latency_ms)) => TestResult {
            version: Some(version),
            latency_ms: Some(latency_ms),
            error: None,
        },
        Err(err) => TestResult {
            version: None,
            latency_ms: None,
            error: Some(err),
        },
    };

    Ok(res)
}

/// Get formatted connection URL string.
pub async fn get_connection_string(
    pool: &sqlx::SqlitePool,
    cipher: &SecretCipher,
    id: &str,
    with_password: bool,
) -> Result<String, AppError> {
    let secret = get_connection_secret(pool, cipher, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Connection not found".to_string()))?;

    let conn = secret.connection;
    let password = if with_password {
        secret.password.as_deref()
    } else if secret.password.is_some() {
        Some("****")
    } else {
        None
    };

    let conn_str = build_connection_string(
        &conn.provider,
        &conn.host,
        conn.port,
        &conn.database,
        &conn.username,
        password,
        conn.ssl_mode,
    );

    Ok(conn_str)
}

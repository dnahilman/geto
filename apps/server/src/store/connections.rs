use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::crypto::SecretCipher;
use crate::error::AppError;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    Disable,
    Allow,
    Prefer,
    Require,
    VerifyCa,
    VerifyFull,
}

impl SslMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            SslMode::Disable => "disable",
            SslMode::Allow => "allow",
            SslMode::Prefer => "prefer",
            SslMode::Require => "require",
            SslMode::VerifyCa => "verify-ca",
            SslMode::VerifyFull => "verify-full",
        }
    }

    pub fn from_str_opt(s: &str) -> Self {
        match s {
            "disable" => SslMode::Disable,
            "allow" => SslMode::Allow,
            "require" => SslMode::Require,
            "verify-ca" => SslMode::VerifyCa,
            "verify-full" => SslMode::VerifyFull,
            _ => SslMode::Prefer,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthMethod {
    Password,
    Key,
}

impl SshAuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            SshAuthMethod::Password => "password",
            SshAuthMethod::Key => "key",
        }
    }

    pub fn from_str_opt(s: &str) -> Self {
        match s {
            "password" => SshAuthMethod::Password,
            _ => SshAuthMethod::Key,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SshInput {
    pub enabled: bool,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_method: SshAuthMethod,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub private_key: Option<String>,
    #[serde(default)]
    pub passphrase: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub enabled: bool,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub has_password: bool,
    pub has_private_key: bool,
    pub has_passphrase: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInput {
    pub name: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub username: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default = "default_ssl_mode")]
    pub ssl_mode: SslMode,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub readonly: bool,
    #[serde(default)]
    pub ssh: Option<SshInput>,
}

fn default_provider() -> String {
    "postgresql".to_string()
}

fn default_ssl_mode() -> SslMode {
    SslMode::Prefer
}

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub username: String,
    pub has_password: bool,
    pub ssl_mode: SslMode,
    pub color: Option<String>,
    pub readonly: bool,
    pub ssh: Option<SshConfig>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct SshSecret {
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ConnectionSecret {
    pub connection: Connection,
    pub password: Option<String>,
    pub ssh_secret: Option<SshSecret>,
}

pub async fn list_connections(pool: &SqlitePool) -> Result<Vec<Connection>, AppError> {
    let rows = sqlx::query("SELECT * FROM connections ORDER BY name")
        .fetch_all(pool)
        .await?;

    let mut connections = Vec::with_capacity(rows.len());
    for row in rows {
        connections.push(row_to_connection(&row));
    }
    Ok(connections)
}

pub async fn get_connection(pool: &SqlitePool, id: &str) -> Result<Option<Connection>, AppError> {
    let opt_row = sqlx::query("SELECT * FROM connections WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(opt_row.as_ref().map(row_to_connection))
}

pub async fn get_connection_secret(
    pool: &SqlitePool,
    cipher: &SecretCipher,
    id: &str,
) -> Result<Option<ConnectionSecret>, AppError> {
    let opt_row = sqlx::query("SELECT * FROM connections WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    let row = match opt_row {
        Some(r) => r,
        None => return Ok(None),
    };

    let connection = row_to_connection(&row);

    let password_enc: Option<String> = row.try_get("password_enc").ok();
    let password = match password_enc {
        Some(enc) if !enc.is_empty() => cipher.decrypt(&enc).ok(),
        _ => None,
    };

    let ssh_secret = if connection.ssh.as_ref().map_or(false, |s| s.enabled) {
        let host: String = row.try_get("ssh_host").unwrap_or_default();
        let port: i32 = row.try_get("ssh_port").unwrap_or(22);
        let username: String = row.try_get("ssh_username").unwrap_or_default();
        let auth_str: String = row.try_get("ssh_auth").unwrap_or_else(|_| "key".to_string());

        let ssh_pwd_enc: Option<String> = row.try_get("ssh_password_enc").ok();
        let ssh_key_enc: Option<String> = row.try_get("ssh_key_enc").ok();
        let ssh_pass_enc: Option<String> = row.try_get("ssh_passphrase_enc").ok();

        Some(SshSecret {
            host,
            port,
            username,
            auth_method: SshAuthMethod::from_str_opt(&auth_str),
            password: ssh_pwd_enc.and_then(|enc| cipher.decrypt(&enc).ok()),
            private_key: ssh_key_enc.and_then(|enc| cipher.decrypt(&enc).ok()),
            passphrase: ssh_pass_enc.and_then(|enc| cipher.decrypt(&enc).ok()),
        })
    } else {
        None
    };

    Ok(Some(ConnectionSecret {
        connection,
        password,
        ssh_secret,
    }))
}

pub async fn create_connection(
    pool: &SqlitePool,
    cipher: &SecretCipher,
    input: ConnectionInput,
) -> Result<Connection, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let password_enc = input.password.as_ref().filter(|p| !p.is_empty()).map(|p| cipher.encrypt(p));

    let (ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_auth, ssh_pwd_enc, ssh_key_enc, ssh_pass_enc) =
        if let Some(ssh) = &input.ssh {
            let pwd_enc = ssh.password.as_ref().filter(|p| !p.is_empty()).map(|p| cipher.encrypt(p));
            let key_enc = ssh.private_key.as_ref().filter(|p| !p.is_empty()).map(|p| cipher.encrypt(p));
            let pass_enc = ssh.passphrase.as_ref().filter(|p| !p.is_empty()).map(|p| cipher.encrypt(p));
            (
                if ssh.enabled { 1 } else { 0 },
                Some(ssh.host.clone()),
                ssh.port,
                Some(ssh.username.clone()),
                ssh.auth_method.as_str().to_string(),
                pwd_enc,
                key_enc,
                pass_enc,
            )
        } else {
            (0, None, 22, None, "key".to_string(), None, None, None)
        };

    sqlx::query(
        r#"
        INSERT INTO connections (
            id, name, provider, host, port, database, username, password_enc, ssl_mode, color, readonly,
            ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_auth, ssh_password_enc, ssh_key_enc, ssh_passphrase_enc,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?
        )
        "#,
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.provider)
    .bind(&input.host)
    .bind(input.port)
    .bind(&input.database)
    .bind(&input.username)
    .bind(password_enc)
    .bind(input.ssl_mode.as_str())
    .bind(&input.color)
    .bind(if input.readonly { 1 } else { 0 })
    .bind(ssh_enabled)
    .bind(ssh_host)
    .bind(ssh_port)
    .bind(ssh_username)
    .bind(ssh_auth)
    .bind(ssh_pwd_enc)
    .bind(ssh_key_enc)
    .bind(ssh_pass_enc)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get_connection(pool, &id)
        .await?
        .ok_or_else(|| AppError::Internal("Failed to retrieve created connection".to_string()))
}

pub async fn update_connection(
    pool: &SqlitePool,
    cipher: &SecretCipher,
    id: &str,
    input: ConnectionInput,
) -> Result<Option<Connection>, AppError> {
    let existing_row = match sqlx::query("SELECT * FROM connections WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
    {
        Some(r) => r,
        None => return Ok(None),
    };

    let existing_pwd_enc: Option<String> = existing_row.try_get("password_enc").ok();
    let password_enc = match input.password {
        Some(ref pwd) if !pwd.is_empty() => Some(cipher.encrypt(pwd)),
        Some(_) => None, // empty string clears password
        None => existing_pwd_enc, // omitted keeps existing
    };

    let now = Utc::now().to_rfc3339();

    let (ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_auth, ssh_pwd_enc, ssh_key_enc, ssh_pass_enc) =
        if let Some(ssh) = &input.ssh {
            let existing_ssh_pwd: Option<String> = existing_row.try_get("ssh_password_enc").ok();
            let existing_ssh_key: Option<String> = existing_row.try_get("ssh_key_enc").ok();
            let existing_ssh_pass: Option<String> = existing_row.try_get("ssh_passphrase_enc").ok();

            let pwd_enc = match ssh.password {
                Some(ref p) if !p.is_empty() => Some(cipher.encrypt(p)),
                Some(_) => None,
                None => existing_ssh_pwd,
            };
            let key_enc = match ssh.private_key {
                Some(ref k) if !k.is_empty() => Some(cipher.encrypt(k)),
                Some(_) => None,
                None => existing_ssh_key,
            };
            let pass_enc = match ssh.passphrase {
                Some(ref p) if !p.is_empty() => Some(cipher.encrypt(p)),
                Some(_) => None,
                None => existing_ssh_pass,
            };

            (
                if ssh.enabled { 1 } else { 0 },
                Some(ssh.host.clone()),
                ssh.port,
                Some(ssh.username.clone()),
                ssh.auth_method.as_str().to_string(),
                pwd_enc,
                key_enc,
                pass_enc,
            )
        } else {
            (0, None, 22, None, "key".to_string(), None, None, None)
        };

    sqlx::query(
        r#"
        UPDATE connections SET
            name = ?, provider = ?, host = ?, port = ?, database = ?, username = ?, password_enc = ?,
            ssl_mode = ?, color = ?, readonly = ?,
            ssh_enabled = ?, ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_auth = ?,
            ssh_password_enc = ?, ssh_key_enc = ?, ssh_passphrase_enc = ?,
            updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&input.name)
    .bind(&input.provider)
    .bind(&input.host)
    .bind(input.port)
    .bind(&input.database)
    .bind(&input.username)
    .bind(password_enc)
    .bind(input.ssl_mode.as_str())
    .bind(&input.color)
    .bind(if input.readonly { 1 } else { 0 })
    .bind(ssh_enabled)
    .bind(ssh_host)
    .bind(ssh_port)
    .bind(ssh_username)
    .bind(ssh_auth)
    .bind(ssh_pwd_enc)
    .bind(ssh_key_enc)
    .bind(ssh_pass_enc)
    .bind(&now)
    .bind(id)
    .execute(pool)
    .await?;

    get_connection(pool, id).await
}

pub async fn set_connection_database(
    pool: &SqlitePool,
    id: &str,
    database: &str,
) -> Result<Option<Connection>, AppError> {
    let now = Utc::now().to_rfc3339();
    let res = sqlx::query("UPDATE connections SET database = ?, updated_at = ? WHERE id = ?")
        .bind(database)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;

    if res.rows_affected() == 0 {
        return Ok(None);
    }

    get_connection(pool, id).await
}

pub async fn delete_connection(pool: &SqlitePool, id: &str) -> Result<bool, AppError> {
    let res = sqlx::query("DELETE FROM connections WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(res.rows_affected() > 0)
}

fn row_to_connection(row: &sqlx::sqlite::SqliteRow) -> Connection {
    let id: String = row.try_get("id").unwrap_or_default();
    let name: String = row.try_get("name").unwrap_or_default();
    let provider: String = row.try_get("provider").unwrap_or_else(|_| "postgresql".to_string());
    let host: String = row.try_get("host").unwrap_or_default();
    let port: i32 = row.try_get("port").unwrap_or(5432);
    let database: String = row.try_get("database").unwrap_or_default();
    let username: String = row.try_get("username").unwrap_or_default();
    let password_enc: Option<String> = row.try_get("password_enc").ok();
    let ssl_str: String = row.try_get("ssl_mode").unwrap_or_else(|_| "prefer".to_string());
    let color: Option<String> = row.try_get("color").ok();
    let readonly: i64 = row.try_get("readonly").unwrap_or(0);
    let created_at: String = row.try_get("created_at").unwrap_or_default();
    let updated_at: String = row.try_get("updated_at").unwrap_or_default();

    let ssh_enabled: Option<i64> = row.try_get("ssh_enabled").ok();
    let ssh = if ssh_enabled == Some(1) {
        let ssh_host: String = row.try_get("ssh_host").unwrap_or_default();
        let ssh_port: i32 = row.try_get("ssh_port").unwrap_or(22);
        let ssh_username: String = row.try_get("ssh_username").unwrap_or_default();
        let ssh_auth: String = row.try_get("ssh_auth").unwrap_or_else(|_| "key".to_string());
        let ssh_pwd_enc: Option<String> = row.try_get("ssh_password_enc").ok();
        let ssh_key_enc: Option<String> = row.try_get("ssh_key_enc").ok();
        let ssh_pass_enc: Option<String> = row.try_get("ssh_passphrase_enc").ok();

        Some(SshConfig {
            enabled: true,
            host: ssh_host,
            port: ssh_port,
            username: ssh_username,
            auth_method: SshAuthMethod::from_str_opt(&ssh_auth),
            has_password: ssh_pwd_enc.is_some(),
            has_private_key: ssh_key_enc.is_some(),
            has_passphrase: ssh_pass_enc.is_some(),
        })
    } else {
        None
    };

    Connection {
        id,
        name,
        provider,
        host,
        port,
        database,
        username,
        has_password: password_enc.is_some(),
        ssl_mode: SslMode::from_str_opt(&ssl_str),
        color,
        readonly: readonly == 1,
        ssh,
        created_at,
        updated_at,
    }
}

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::store::connections::{
    create_connection, delete_connection, get_connection, get_connection_secret,
    list_connections, set_connection_database, update_connection, Connection, ConnectionInput,
    SslMode,
};

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct SetDatabaseInput {
    pub name: String,
}

#[derive(Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ConnectionStringQuery {
    #[serde(rename = "withPassword")]
    pub with_password: Option<String>,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct DeleteResponse {
    pub deleted: bool,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStringResponse {
    pub connection_string: String,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/connections",
    responses(
        (status = 200, description = "List all connections", body = Vec<Connection>)
    )
)]
pub async fn list_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Connection>>, AppError> {
    let connections = list_connections(&state.sqlite_pool).await?;
    Ok(Json(connections))
}

#[utoipa::path(
    post,
    path = "/api/connections",
    request_body = ConnectionInput,
    responses(
        (status = 200, description = "Create connection", body = Connection)
    )
)]
pub async fn create_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ConnectionInput>,
) -> Result<Json<Connection>, AppError> {
    let connection = create_connection(&state.sqlite_pool, &state.cipher, input).await?;
    Ok(Json(connection))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "Get connection by ID", body = Connection),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn get_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Connection>, AppError> {
    match get_connection(&state.sqlite_pool, &id).await? {
        Some(conn) => Ok(Json(conn)),
        None => Err(AppError::NotFound("Not found".to_string())),
    }
}

#[utoipa::path(
    patch,
    path = "/api/connections/{id}",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = ConnectionInput,
    responses(
        (status = 200, description = "Update connection", body = Connection),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn update_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<ConnectionInput>,
) -> Result<Json<Connection>, AppError> {
    match update_connection(&state.sqlite_pool, &state.cipher, &id, input).await? {
        Some(conn) => {
            state.registry.close_driver(&id).await;
            Ok(Json(conn))
        }
        None => Err(AppError::NotFound("Not found".to_string())),
    }
}

#[utoipa::path(
    delete,
    path = "/api/connections/{id}",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "Delete connection", body = DeleteResponse),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn delete_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<DeleteResponse>, AppError> {
    let deleted = delete_connection(&state.sqlite_pool, &id).await?;
    if deleted {
        state.registry.close_driver(&id).await;
        Ok(Json(DeleteResponse { deleted: true }))
    } else {
        Err(AppError::NotFound("Not found".to_string()))
    }
}

#[utoipa::path(
    post,
    path = "/api/connections/{id}/database",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = SetDatabaseInput,
    responses(
        (status = 200, description = "Switch default database", body = Connection),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn set_database_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SetDatabaseInput>,
) -> Result<Json<Connection>, AppError> {
    match set_connection_database(&state.sqlite_pool, &id, &body.name).await? {
        Some(conn) => {
            state.registry.close_driver(&id).await;
            Ok(Json(conn))
        }
        None => Err(AppError::NotFound("Not found".to_string())),
    }
}

async fn run_ping_test(
    provider: &str,
    host: &str,
    port: i32,
    database: &str,
    username: &str,
    password: Option<&str>,
    ssl_mode: SslMode,
) -> Result<(String, u64), String> {
    let t0 = std::time::Instant::now();

    match provider {
        "mysql" => {
            let ssl = match ssl_mode {
                SslMode::Disable => sqlx::mysql::MySqlSslMode::Disabled,
                SslMode::Require => sqlx::mysql::MySqlSslMode::Required,
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
        other => Err(format!("Unsupported provider: {}", other)),
    }
}

#[utoipa::path(
    post,
    path = "/api/connections/test",
    request_body = ConnectionInput,
    responses(
        (status = 200, description = "Test unsaved connection parameters", body = TestResult)
    )
)]
pub async fn test_unsaved_handler(
    Json(input): Json<ConnectionInput>,
) -> Json<TestResult> {
    match run_ping_test(
        &input.provider,
        &input.host,
        input.port,
        &input.database,
        &input.username,
        input.password.as_deref(),
        input.ssl_mode,
    )
    .await
    {
        Ok((version, latency_ms)) => Json(TestResult {
            version: Some(version),
            latency_ms: Some(latency_ms),
            error: None,
        }),
        Err(err) => Json(TestResult {
            version: None,
            latency_ms: None,
            error: Some(err),
        }),
    }
}

#[utoipa::path(
    post,
    path = "/api/connections/{id}/test",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "Test saved connection", body = TestResult),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn test_saved_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<TestResult>, AppError> {
    let secret = get_connection_secret(&state.sqlite_pool, &state.cipher, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Not found".to_string()))?;

    let conn = secret.connection;
    match run_ping_test(
        &conn.provider,
        &conn.host,
        conn.port,
        &conn.database,
        &conn.username,
        secret.password.as_deref(),
        conn.ssl_mode,
    )
    .await
    {
        Ok((version, latency_ms)) => Ok(Json(TestResult {
            version: Some(version),
            latency_ms: Some(latency_ms),
            error: None,
        })),
        Err(err) => Ok(Json(TestResult {
            version: None,
            latency_ms: None,
            error: Some(err),
        })),
    }
}

fn build_connection_string(
    provider: &str,
    host: &str,
    port: i32,
    database: &str,
    username: &str,
    password: Option<&str>,
    ssl_mode: SslMode,
) -> String {
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

    let scheme = if provider == "mysql" { "mysql" } else { "postgresql" };
    let mut url = format!("{}://{}{}:{}/{}", scheme, auth, host, port, database);

    if ssl_mode != SslMode::Prefer && ssl_mode != SslMode::Disable {
        let param = if provider == "mysql" { "ssl-mode" } else { "sslmode" };
        url.push_str(&format!("?{}={}", param, ssl_mode.as_str()));
    }

    url
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/connection-string",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ConnectionStringQuery
    ),
    responses(
        (status = 200, description = "Get formatted connection URL string", body = ConnectionStringResponse),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn connection_string_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<ConnectionStringQuery>,
) -> Result<Json<ConnectionStringResponse>, AppError> {
    let secret = get_connection_secret(&state.sqlite_pool, &state.cipher, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("Not found".to_string()))?;

    let conn = secret.connection;
    let with_pwd = q.with_password.as_deref() == Some("true");
    let password = if with_pwd {
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

    Ok(Json(ConnectionStringResponse { connection_string: conn_str }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/connections", get(list_handler).post(create_handler))
        .route("/connections/test", post(test_unsaved_handler))
        .route(
            "/connections/{id}",
            get(get_handler).patch(update_handler).delete(delete_handler),
        )
        .route("/connections/{id}/database", post(set_database_handler))
        .route("/connections/{id}/test", post(test_saved_handler))
        .route(
            "/connections/{id}/connection-string",
            get(connection_string_handler),
        )
}

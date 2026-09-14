use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;

pub use geto_core::services::connections::{
    ConnectionStringResponse, DeleteResponse, SetDatabaseInput, TestResult,
};
use geto_core::store::connections::{Connection, ConnectionInput};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ConnectionStringQuery {
    #[serde(rename = "withPassword")]
    pub with_password: Option<String>,
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
    let connections = geto_core::services::connections::list_connections(&state.sqlite_pool).await?;
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
    let connection = geto_core::services::connections::create_connection(&state.sqlite_pool, &state.cipher, input).await?;
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
    match geto_core::services::connections::get_connection(&state.sqlite_pool, &id).await? {
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
    match geto_core::services::connections::update_connection(&state.sqlite_pool, &state.cipher, &id, input).await? {
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
    let deleted = geto_core::services::connections::delete_connection(&state.sqlite_pool, &state.registry, &id).await?;
    if deleted {
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
    match geto_core::services::connections::set_connection_database(&state.sqlite_pool, &state.registry, &id, &body.name).await? {
        Some(conn) => Ok(Json(conn)),
        None => Err(AppError::NotFound("Not found".to_string())),
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
    let res = geto_core::services::connections::test_unsaved_connection(&input).await;
    Json(res)
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
    let res = geto_core::services::connections::test_saved_connection(&state.sqlite_pool, &state.cipher, &id).await?;
    Ok(Json(res))
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
    let with_pwd = q.with_password.as_deref() == Some("true");
    let conn_str = geto_core::services::connections::get_connection_string(&state.sqlite_pool, &state.cipher, &id, with_pwd).await?;
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

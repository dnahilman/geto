use std::sync::Arc;
use axum::{
    extract::{Path, State},
    routing::{delete, post},
    Json, Router,
};

pub use geto_core::services::databases::{
    CreateDatabaseRequest, CreateDatabaseResponse, DropDatabaseResponse,
};
use crate::error::AppError;
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/api/connections/{id}/databases",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = CreateDatabaseRequest,
    responses(
        (status = 200, description = "Create new database", body = CreateDatabaseResponse),
        (status = 400, description = "Invalid database name")
    )
)]
pub async fn create_database_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateDatabaseRequest>,
) -> Result<Json<CreateDatabaseResponse>, AppError> {
    let res = geto_core::services::databases::create_database(
        &state.registry,
        &state.core,
        &id,
        &body.name,
    )
    .await?;
    Ok(Json(res))
}

#[utoipa::path(
    delete,
    path = "/api/connections/{id}/databases/{name}",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("name" = String, Path, description = "Database name")
    ),
    responses(
        (status = 200, description = "Drop database", body = DropDatabaseResponse),
        (status = 400, description = "Invalid database name")
    )
)]
pub async fn drop_database_handler(
    State(state): State<Arc<AppState>>,
    Path((id, name)): Path<(String, String)>,
) -> Result<Json<DropDatabaseResponse>, AppError> {
    let res = geto_core::services::databases::drop_database(
        &state.registry,
        &state.core,
        &id,
        &name,
    )
    .await?;
    Ok(Json(res))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/connections/{id}/databases", post(create_database_handler))
        .route("/connections/{id}/databases/{name}", delete(drop_database_handler))
}

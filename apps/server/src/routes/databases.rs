use std::sync::Arc;
use axum::{
    extract::{Path, State},
    routing::{delete, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateDatabaseRequest {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CreateDatabaseResponse {
    pub created: bool,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DropDatabaseResponse {
    pub dropped: bool,
}

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
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Database name cannot be empty".to_string()));
    }
    let driver = state.registry.get_driver(&state, &id).await?;
    driver.create_database(&body.name).await?;
    Ok(Json(CreateDatabaseResponse {
        created: true,
        name: body.name,
    }))
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
    if name.trim().is_empty() {
        return Err(AppError::BadRequest("Database name cannot be empty".to_string()));
    }
    let driver = state.registry.get_driver(&state, &id).await?;
    driver.drop_database(&name).await?;
    Ok(Json(DropDatabaseResponse { dropped: true }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/connections/{id}/databases", post(create_database_handler))
        .route("/connections/{id}/databases/{name}", delete(drop_database_handler))
}

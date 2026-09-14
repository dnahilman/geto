use serde::{Deserialize, Serialize};

use crate::db::DriverRegistry;
use crate::error::AppError;
use crate::state::CoreState;

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateDatabaseRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CreateDatabaseResponse {
    pub created: bool,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DropDatabaseResponse {
    pub dropped: bool,
}

/// Creates a new database on the connected instance.
pub async fn create_database(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    name: &str,
) -> Result<CreateDatabaseResponse, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::BadRequest("Database name cannot be empty".to_string()));
    }
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.create_database(name).await?;
    Ok(CreateDatabaseResponse {
        created: true,
        name: name.to_string(),
    })
}

/// Drops a database on the connected instance.
pub async fn drop_database(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    name: &str,
) -> Result<DropDatabaseResponse, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::BadRequest("Database name cannot be empty".to_string()));
    }
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.drop_database(name).await?;
    Ok(DropDatabaseResponse { dropped: true })
}

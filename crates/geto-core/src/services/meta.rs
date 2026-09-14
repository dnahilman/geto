use serde::{Deserialize, Serialize};

use crate::db::types::{
    CompletionResponse, DatabaseInfo, SchemaTree, TableDetailResponse,
};
use crate::db::DriverRegistry;
use crate::error::AppError;
use crate::state::CoreState;

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct TreeQuery {
    pub search: Option<String>,
}

/// List all databases for a connection.
pub async fn list_databases(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
) -> Result<Vec<DatabaseInfo>, AppError> {
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.list_databases().await
}

/// List all schemas for a connection.
pub async fn list_schemas(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
) -> Result<Vec<String>, AppError> {
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.list_schemas().await
}

/// Get schema tree with optional filter search.
pub async fn get_tree(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    search: Option<&str>,
) -> Result<Vec<SchemaTree>, AppError> {
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.get_tree(search).await
}

/// Get table details (columns, indexes, constraints, keys).
pub async fn get_table_detail(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
) -> Result<TableDetailResponse, AppError> {
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.get_table_detail(Some(schema), table).await
}

/// Get SQL autocompletion metadata (tables, columns, functions).
pub async fn get_completion(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
) -> Result<CompletionResponse, AppError> {
    let driver = registry
        .get_driver(state, connection_id)
        .await?;
    driver.get_completion().await
}

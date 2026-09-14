use std::sync::Arc;
use tauri::State;

use geto_core::db::types::{
    CompletionResponse, DatabaseInfo, SchemaTree, TableDetailResponse,
};
use geto_core::services::meta::{
    get_completion as service_completion, get_table_detail as service_detail,
    get_tree as service_tree, list_databases as service_databases, list_schemas as service_schemas,
};
use geto_core::state::CoreState;

#[tauri::command]
pub async fn list_databases(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
) -> Result<Vec<DatabaseInfo>, String> {
    service_databases(&state.registry, &state, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_schemas(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    service_schemas(&state.registry, &state, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_schema_tree(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    search: Option<String>,
) -> Result<Vec<SchemaTree>, String> {
    service_tree(&state.registry, &state, &connection_id, search.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_table_detail(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<TableDetailResponse, String> {
    service_detail(&state.registry, &state, &connection_id, &schema, &table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_completion(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
) -> Result<CompletionResponse, String> {
    service_completion(&state.registry, &state, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

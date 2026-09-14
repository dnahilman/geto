use std::sync::Arc;
use tauri::State;

use geto_core::db::shared::QueryResult;
use geto_core::services::tables::{
    create_table as service_create, delete_row as service_delete_row, drop_table as service_drop,
    get_rows as service_get_rows, insert_row as service_insert_row,
    truncate_table as service_truncate, update_row as service_update_row, CreateTableBody,
    CreateTableResponse, DropTableResponse, RowsQueryParams, RowsResponse, TruncateTableResponse,
};
use geto_core::state::CoreState;

#[tauri::command]
pub async fn get_table_rows(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
    params: RowsQueryParams,
) -> Result<RowsResponse, String> {
    service_get_rows(
        &state.registry,
        &state,
        &connection_id,
        &schema,
        &table,
        params,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn insert_table_row(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
    values: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, String> {
    service_insert_row(
        &state.registry,
        &state,
        &connection_id,
        &schema,
        &table,
        values,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_table_row(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
    pk: serde_json::Map<String, serde_json::Value>,
    values: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, String> {
    service_update_row(
        &state.registry,
        &state,
        &connection_id,
        &schema,
        &table,
        pk,
        values,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_table_row(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
    pk: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, String> {
    service_delete_row(
        &state.registry,
        &state,
        &connection_id,
        &schema,
        &table,
        pk,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_table(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    body: CreateTableBody,
) -> Result<CreateTableResponse, String> {
    service_create(&state.registry, &state, &connection_id, body)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_table(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<DropTableResponse, String> {
    service_drop(&state.registry, &state, &connection_id, &schema, &table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn truncate_table(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<TruncateTableResponse, String> {
    service_truncate(&state.registry, &state, &connection_id, &schema, &table)
        .await
        .map_err(|e| e.to_string())
}

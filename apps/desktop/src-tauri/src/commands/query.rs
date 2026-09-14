use std::sync::Arc;
use tauri::State;

use geto_core::db::shared::SafetyReport;
use geto_core::services::query::{
    analyze_query as service_analyze, clear_query_history as service_clear_hist,
    execute_query as service_execute, list_query_history as service_list_hist, QueryBody,
    QueryResponse,
};
use geto_core::state::CoreState;
use geto_core::store::history::HistoryEntry;

#[tauri::command]
pub async fn execute_query(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    body: QueryBody,
) -> Result<QueryResponse, String> {
    service_execute(&state.registry, &state, &connection_id, body)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn analyze_query(sql: String) -> Result<SafetyReport, String> {
    Ok(service_analyze(&sql))
}

#[tauri::command]
pub async fn list_query_history(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    limit: Option<u32>,
) -> Result<Vec<HistoryEntry>, String> {
    service_list_hist(&state.sqlite_pool, &connection_id, limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_query_history(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
) -> Result<u64, String> {
    service_clear_hist(&state.sqlite_pool, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

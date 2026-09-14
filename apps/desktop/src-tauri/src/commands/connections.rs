use std::sync::Arc;
use tauri::State;

use geto_core::services::connections::{
    create_connection as service_create, delete_connection as service_delete,
    get_connection as service_get, get_connection_string as service_get_conn_str,
    list_connections as service_list, set_connection_database as service_set_db,
    test_saved_connection as service_test_saved, test_unsaved_connection as service_test_unsaved,
    update_connection as service_update, TestResult,
};
use geto_core::state::CoreState;
use geto_core::store::connections::{Connection, ConnectionInput};

#[tauri::command]
pub async fn list_connections(
    state: State<'_, Arc<CoreState>>,
) -> Result<Vec<Connection>, String> {
    service_list(&state.sqlite_pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connection(
    state: State<'_, Arc<CoreState>>,
    id: String,
) -> Result<Option<Connection>, String> {
    service_get(&state.sqlite_pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_connection(
    state: State<'_, Arc<CoreState>>,
    input: ConnectionInput,
) -> Result<Connection, String> {
    service_create(&state.sqlite_pool, &state.cipher, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_connection(
    state: State<'_, Arc<CoreState>>,
    id: String,
    input: ConnectionInput,
) -> Result<Option<Connection>, String> {
    let res = service_update(&state.sqlite_pool, &state.cipher, &id, input)
        .await
        .map_err(|e| e.to_string())?;
    if res.is_some() {
        state.registry.close_driver(&id).await;
    }
    Ok(res)
}

#[tauri::command]
pub async fn delete_connection(
    state: State<'_, Arc<CoreState>>,
    id: String,
) -> Result<bool, String> {
    service_delete(&state.sqlite_pool, &state.registry, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_connection_database(
    state: State<'_, Arc<CoreState>>,
    id: String,
    database: String,
) -> Result<Option<Connection>, String> {
    service_set_db(&state.sqlite_pool, &state.registry, &id, &database)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_unsaved_connection(
    input: ConnectionInput,
) -> Result<TestResult, String> {
    Ok(service_test_unsaved(&input).await)
}

#[tauri::command]
pub async fn test_saved_connection(
    state: State<'_, Arc<CoreState>>,
    id: String,
) -> Result<TestResult, String> {
    service_test_saved(&state.sqlite_pool, &state.cipher, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connection_string(
    state: State<'_, Arc<CoreState>>,
    id: String,
    with_password: bool,
) -> Result<String, String> {
    service_get_conn_str(&state.sqlite_pool, &state.cipher, &id, with_password)
        .await
        .map_err(|e| e.to_string())
}

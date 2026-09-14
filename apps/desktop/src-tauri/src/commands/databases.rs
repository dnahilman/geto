use std::sync::Arc;
use tauri::State;

use geto_core::services::databases::{
    create_database as service_create_db, drop_database as service_drop_db, CreateDatabaseResponse,
    DropDatabaseResponse,
};
use geto_core::state::CoreState;

#[tauri::command]
pub async fn create_database(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    name: String,
) -> Result<CreateDatabaseResponse, String> {
    service_create_db(&state.registry, &state, &connection_id, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_database(
    state: State<'_, Arc<CoreState>>,
    connection_id: String,
    name: String,
) -> Result<DropDatabaseResponse, String> {
    service_drop_db(&state.registry, &state, &connection_id, &name)
        .await
        .map_err(|e| e.to_string())
}

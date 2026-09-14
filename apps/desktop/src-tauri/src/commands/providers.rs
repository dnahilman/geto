use geto_core::services::providers::{providers_list, ProviderMeta};

#[tauri::command]
pub async fn get_providers() -> Result<Vec<ProviderMeta>, String> {
    Ok(providers_list())
}

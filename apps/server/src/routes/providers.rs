use axum::{response::Json, routing::get, Router};
use std::sync::Arc;

pub use geto_core::services::providers::{providers_list, ProviderMeta};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/api/providers",
    responses(
        (status = 200, description = "List supported database providers", body = Vec<ProviderMeta>)
    )
)]
pub async fn get_providers() -> Json<Vec<ProviderMeta>> {
    Json(providers_list())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/providers", get(get_providers))
}

use axum::{response::Json, routing::get, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub default_port: u16,
    pub url_schemes: Vec<String>,
}

pub fn providers_list() -> Vec<ProviderMeta> {
    vec![
        ProviderMeta {
            id: "postgresql".to_string(),
            label: "PostgreSQL".to_string(),
            kind: "relational".to_string(),
            default_port: 5432,
            url_schemes: vec!["postgres".to_string(), "postgresql".to_string()],
        },
        ProviderMeta {
            id: "mysql".to_string(),
            label: "MySQL".to_string(),
            kind: "relational".to_string(),
            default_port: 3306,
            url_schemes: vec!["mysql".to_string(), "mysql2".to_string()],
        },
    ]
}

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

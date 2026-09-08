pub mod connections;
pub mod databases;
pub mod meta;
pub mod providers;
pub mod query;
pub mod tables;

use std::sync::Arc;
use axum::{
    middleware,
    response::Json,
    routing::{get, post},
    Router,
};

use crate::auth::handlers::{login, logout, me};
use crate::auth::middleware::require_auth;
use crate::state::AppState;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
    pub name: String,
    pub version: String,
}

#[utoipa::path(
    get,
    path = "/api/health",
    responses(
        (status = 200, description = "Server health check", body = HealthResponse)
    )
)]
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        name: "geto".to_string(),
        version: "0.4.0".to_string(),
    })
}

pub fn api_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let auth_routes = Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me));

    let protected_routes = Router::new()
        .merge(providers::router())
        .merge(connections::router())
        .merge(meta::router())
        .merge(tables::router())
        .merge(query::router())
        .merge(databases::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_auth,
        ));

    Router::new()
        .route("/health", get(health))
        .merge(crate::openapi::router())
        .merge(auth_routes)
        .merge(protected_routes)
}

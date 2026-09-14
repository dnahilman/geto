pub mod auth;
pub mod config;
pub mod openapi;
pub mod routes;
pub mod state;

pub use geto_core::crypto;
pub use geto_core::db;
pub use geto_core::error;
pub use geto_core::services;
pub use geto_core::store;

use std::sync::Arc;
use axum::{http::StatusCode, response::Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

async fn api_not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Not found" })),
    )
}

async fn web_not_found() -> (StatusCode, &'static str) {
    (
        StatusCode::NOT_FOUND,
        "Web build not found. Please build apps/web or configure GETO_WEB_DIR.",
    )
}

pub async fn http_logger_middleware(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let start = std::time::Instant::now();
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();

    let res = next.run(req).await;
    let elapsed = start.elapsed();
    let status = res.status();

    let ms = elapsed.as_secs_f64() * 1000.0;
    let latency_str = if ms < 1.0 {
        format!("{:.2}ms", ms)
    } else if ms < 100.0 {
        format!("{:.1}ms", ms)
    } else {
        format!("{:.0}ms", ms)
    };

    if status.is_server_error() {
        tracing::error!("{:<6} {}{} {} ({})", method, path, query, status, latency_str);
    } else if status.is_client_error() {
        tracing::warn!("{:<6} {}{} {} ({})", method, path, query, status, latency_str);
    } else {
        tracing::info!("{:<6} {}{} {} ({})", method, path, query, status, latency_str);
    }

    res
}

pub fn build_app(state: Arc<AppState>) -> Router {
    let api = routes::api_router(state.clone()).fallback(api_not_found);

    let mut router = Router::new()
        .nest("/api", api)
        .layer(axum::middleware::from_fn(http_logger_middleware))
        .layer(CorsLayer::permissive());

    let web_dir = &state.config.web_dir;
    let fallback_200 = web_dir.join("200.html");
    let fallback_index = web_dir.join("index.html");

    if fallback_200.exists() || fallback_index.exists() {
        let fallback_file = if fallback_200.exists() {
            fallback_200
        } else {
            fallback_index
        };
        let serve_dir = ServeDir::new(web_dir).fallback(ServeFile::new(fallback_file));
        router = router.fallback_service(serve_dir);
    } else {
        router = router.fallback(web_not_found);
    }

    router.with_state(state)
}


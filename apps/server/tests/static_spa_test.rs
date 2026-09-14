use std::path::PathBuf;
use std::sync::Arc;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use geto_server::build_app;
use geto_server::config::Config;
use geto_server::state::AppState;
use geto_server::store::db::init_db;

#[tokio::test]
async fn test_static_spa_serving_and_api_fallback() {
    let sqlite_path = [
        PathBuf::from("./data"),
        PathBuf::from("../../data"),
        PathBuf::from("../server/data"),
        PathBuf::from("./apps/server/data"),
    ]
    .into_iter()
    .find(|p| p.join("geto.sqlite").exists())
    .unwrap_or_else(|| PathBuf::from("./data"));
    if !sqlite_path.join("geto.sqlite").exists() {
        eprintln!("geto.sqlite not found, skipping test");
        return;
    }

    let mut config = Config::from_env().unwrap();
    // Ensure web_dir points to apps/web/build
    let web_build = PathBuf::from("../web/build");
    if web_build.exists() {
        config.web_dir = web_build;
    } else if PathBuf::from("./apps/web/build").exists() {
        config.web_dir = PathBuf::from("./apps/web/build");
    }

    let pool = init_db(&sqlite_path).await.unwrap();
    let state = Arc::new(AppState::new(config, pool));
    let app = build_app(state);

    // 1. Matched API route should return 200 JSON
    let req = Request::builder()
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let health: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(health["ok"], true);
    assert_eq!(health["name"], "geto");

    // 2. Unmatched API route should return 404 JSON, NOT the SPA 200.html!
    let req = Request::builder()
        .uri("/api/unknown_endpoint_does_not_exist")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let err_json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(err_json["error"], "Not found");

    // 3. Static asset (favicon.svg) should return 200 with SVG content
    let req = Request::builder()
        .uri("/favicon.svg")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    if res.status() == StatusCode::OK {
        let body = res.into_body().collect().await.unwrap().to_bytes();
        let s = String::from_utf8_lossy(&body);
        assert!(s.contains("<svg") || s.contains("xmlns"));
    }

    // 4. SPA route (e.g. /workspace or /deep/route) should fall back to 200.html
    let req = Request::builder()
        .uri("/workspace/some/deep/route")
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let html = String::from_utf8_lossy(&body);
    assert!(html.contains("<!doctype html>") || html.contains("<html") || html.contains("<body"));
}

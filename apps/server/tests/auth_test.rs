use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

use geto_server::build_app;
use geto_server::config::Config;
use geto_server::state::AppState;
use geto_server::store::init_db;

async fn setup() -> (axum::Router, Arc<AppState>, String) {
    let temp_dir = std::env::temp_dir().join(format!("geto_test_auth_{}", uuid::Uuid::new_v4()));
    let config = Config {
        port: 0,
        node_env: "test".to_string(),
        auth_password: "super-secret-password".to_string(),
        master_key: "test-master-key-xyz".to_string(),
        data_dir: temp_dir,
        web_dir: std::path::PathBuf::from("./web/build"),
    };

    let sqlite_pool = init_db(&config.data_dir).await.expect("failed to init db");
    let session_token = geto_server::auth::generate_session_token(&config.master_key);
    let state = Arc::new(AppState::new(config, sqlite_pool));
    let app = build_app(state.clone());

    (app, state, session_token)
}

#[tokio::test]
async fn test_health_check() {
    let (app, _, _) = setup().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["name"], "geto");
}

#[tokio::test]
async fn test_login_success_and_cookie() {
    let (app, _, _) = setup().await;

    let req_body = serde_json::json!({
        "password": "super-secret-password"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(req_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let set_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .expect("Set-Cookie header missing")
        .to_str()
        .unwrap();

    assert!(set_cookie.contains("geto_session="));
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["authenticated"], true);
}

#[tokio::test]
async fn test_login_wrong_password() {
    let (app, _, _) = setup().await;

    let req_body = serde_json::json!({
        "password": "wrong-password"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(req_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["error"], "Invalid password");
}

#[tokio::test]
async fn test_protected_route_without_cookie_fails() {
    let (app, _, _) = setup().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/connections")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["error"], "Unauthorized");
}

#[tokio::test]
async fn test_protected_route_with_valid_cookie_succeeds() {
    let (app, _, session_token) = setup().await;

    let cookie = format!("geto_session={}", session_token);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/connections")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_auth_me_and_logout() {
    let (app, _, session_token) = setup().await;

    // Check /me with cookie
    let cookie = format!("geto_session={}", session_token);
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["authenticated"], true);

    // Logout
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/logout")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let set_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .expect("Set-Cookie missing")
        .to_str()
        .unwrap();

    assert!(set_cookie.contains("Max-Age=0"));
}

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
    let temp_dir = std::env::temp_dir().join(format!("geto_test_conn_{}", uuid::Uuid::new_v4()));
    let config = Config {
        port: 0,
        node_env: "test".to_string(),
        auth_password: "test-password-123".to_string(),
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
async fn test_providers_endpoint() {
    let (app, _, session_token) = setup().await;
    let cookie = format!("geto_session={}", session_token);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/providers")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let providers: Vec<Value> = serde_json::from_slice(&bytes).unwrap();

    let ids: Vec<&str> = providers.iter().filter_map(|p| p["id"].as_str()).collect();
    assert!(ids.contains(&"postgresql"));
    assert!(ids.contains(&"mysql"));
    assert!(!ids.contains(&"redis"), "Redis must be excluded in SQL-only backend");
}

#[tokio::test]
async fn test_connection_full_crud_lifecycle() {
    let (app, _, session_token) = setup().await;
    let cookie = format!("geto_session={}", session_token);

    // 1. Create connection
    let create_payload = serde_json::json!({
        "name": "Production DB",
        "provider": "mysql",
        "host": "db.example.com",
        "port": 3306,
        "database": "analytics",
        "username": "admin",
        "password": "SecretPassword123!",
        "sslMode": "prefer",
        "readonly": false
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/connections")
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(create_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let created: Value = serde_json::from_slice(&bytes).unwrap();

    let id = created["id"].as_str().expect("id missing").to_string();
    assert_eq!(created["name"], "Production DB");
    assert_eq!(created["provider"], "mysql");
    assert_eq!(created["hasPassword"], true);
    assert!(created.get("password").is_none(), "Password plaintext must never be returned");

    // 2. List connections
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/connections")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let list: Vec<Value> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["id"], id);

    // 3. Get single connection
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/connections/{}", id))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let fetched: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(fetched["id"], id);
    assert_eq!(fetched["hasPassword"], true);

    // 4. Patch connection (update name)
    let patch_payload = serde_json::json!({
        "name": "Production DB (Updated)",
        "provider": "mysql",
        "host": "db.example.com",
        "port": 3306,
        "database": "analytics",
        "username": "admin",
        "sslMode": "prefer",
        "readonly": true
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/connections/{}", id))
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(patch_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let updated: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(updated["name"], "Production DB (Updated)");
    assert_eq!(updated["readonly"], true);
    assert_eq!(updated["hasPassword"], true, "Password should be preserved on omitted update");

    // 5. Switch active database
    let db_payload = serde_json::json!({ "name": "finance" });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/connections/{}/database", id))
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(db_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let switched: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(switched["database"], "finance");

    // 6. Get connection string
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/connections/{}/connection-string?withPassword=true", id))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let conn_str: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(conn_str["connectionString"].as_str().unwrap().starts_with("mysql://admin:SecretPassword123!@db.example.com:3306/finance"));

    // 7. Delete connection
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/connections/{}", id))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);

    // 8. Verify 404 after deletion
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/connections/{}", id))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

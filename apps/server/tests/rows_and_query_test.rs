use std::path::PathBuf;
use std::sync::Arc;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use geto_server::build_app;
use geto_server::config::Config;
use geto_server::db::shared::{analyze_sql, inspect_select, split_statements};
use geto_server::state::AppState;
use geto_server::store::db::init_db;

#[test]
fn test_safety_analyzer_dangerous_and_safe() {
    let r1 = analyze_sql("DELETE FROM users");
    assert!(r1.dangerous);
    assert!(r1.reasons[0].contains("without a WHERE clause"));

    let r2 = analyze_sql("DELETE FROM users WHERE id = 1");
    assert!(!r2.dangerous);

    let r3 = analyze_sql("UPDATE users SET name = 'alice'");
    assert!(r3.dangerous);

    let r4 = analyze_sql("UPDATE users SET name = 'alice' WHERE id = 1");
    assert!(!r4.dangerous);

    let r5 = analyze_sql("TRUNCATE TABLE users");
    assert!(r5.dangerous);

    let r6 = analyze_sql("DROP TABLE users");
    assert!(r6.dangerous);

    let r7 = analyze_sql("SELECT * FROM users");
    assert!(!r7.dangerous);
}

#[test]
fn test_inspect_select() {
    let s1 = inspect_select("SELECT * FROM users");
    assert!(s1.single_select);
    assert!(!s1.has_limit);

    let s2 = inspect_select("SELECT * FROM users LIMIT 10");
    assert!(s2.single_select);
    assert!(s2.has_limit);

    let s3 = inspect_select("SELECT * FROM users; SELECT * FROM roles");
    assert!(!s3.single_select);
}

#[test]
fn test_split_statements_complex() {
    let sql = r#"
        SELECT * FROM users WHERE note = 'semicolon; in string';
        -- comment with ;
        SELECT 123;
    "#;
    let stmts = split_statements(sql);
    assert_eq!(stmts.len(), 2);
}

#[tokio::test]
async fn test_rows_and_query_routes_live() {
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
        eprintln!("geto.sqlite not found, skipping live integration test");
        return;
    }

    let config = Config::from_env().unwrap();
    let pool = match init_db(&sqlite_path).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to open geto.sqlite: {}, skipping", e);
            return;
        }
    };

    let state = Arc::new(AppState::new(config, pool));
    let app = build_app(state.clone());

    let conn_id = "94dd25e3-4e0a-4e20-be01-870c80bb1043";
    let cookie_header = format!("geto_session={}", state.session_token);

    // 1. GET /api/connections/:id/tables/kondektur/kdr_t_ases_pradinas_approval/rows?limit=10&offset=0
    let req = Request::builder()
        .uri(format!(
            "/api/connections/{}/tables/kondektur/kdr_t_ases_pradinas_approval/rows?limit=10&offset=0",
            conn_id
        ))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    if res.status() != StatusCode::OK {
        eprintln!("Remote MySQL not reachable (status {}), skipping live rows assertions", res.status());
        return;
    }

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let rows_resp: Value = serde_json::from_slice(&body).unwrap();
    assert!(rows_resp.get("result").is_some());
    assert!(rows_resp.get("durationMs").is_some());

    let result = rows_resp.get("result").unwrap();
    let rows = result.get("rows").unwrap().as_array().unwrap();
    let columns = result.get("columns").unwrap().as_array().unwrap();
    println!("Fetched {} rows and {} columns!", rows.len(), columns.len());
    assert!(!columns.is_empty());

    // 2. POST /api/connections/:id/query with safe query: SELECT 42 AS answer, 'rust' AS language
    let query_body = json!({
        "sql": "SELECT 42 AS answer, 'rust' AS language;"
    });
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/connections/{}/query", conn_id))
        .header(header::COOKIE, &cookie_header)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(query_body.to_string()))
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let q_resp: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(q_resp.get("requiresConfirmation"), Some(&Value::Bool(false)));

    let results = q_resp.get("results").unwrap().as_array().unwrap();
    assert_eq!(results.len(), 1);
    let first_row = &results[0].get("rows").unwrap().as_array().unwrap()[0];
    assert_eq!(first_row[0], json!(42));
    assert_eq!(first_row[1], json!("rust"));

    // 3. POST /api/connections/:id/query with dangerous query: DROP TABLE dangerous_test;
    let dangerous_body = json!({
        "sql": "DROP TABLE dangerous_test;"
    });
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/connections/{}/query", conn_id))
        .header(header::COOKIE, &cookie_header)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(dangerous_body.to_string()))
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let d_resp: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(d_resp.get("requiresConfirmation"), Some(&Value::Bool(true)));
    assert!(d_resp.get("report").unwrap().get("dangerous").unwrap().as_bool().unwrap());

    // 4. GET /api/connections/:id/history
    let req = Request::builder()
        .uri(format!("/api/connections/{}/history", conn_id))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let history: Value = serde_json::from_slice(&body).unwrap();
    let history_arr = history.as_array().unwrap();
    assert!(!history_arr.is_empty());
    println!("Recorded {} history items successfully!", history_arr.len());
}

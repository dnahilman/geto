use std::path::PathBuf;
use std::sync::Arc;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use geto_server::build_app;
use geto_server::config::Config;
use geto_server::db::types::TableDataOptions;
use geto_server::state::AppState;
use geto_server::store::db::init_db;

const POSTGRES_CONN_ID: &str = "e1ae546c-b34b-4bec-aad4-8ac7dae85efb";

async fn setup_test_state() -> Option<Arc<AppState>> {
    let sqlite_path = PathBuf::from("../server/data");
    if !sqlite_path.join("geto.sqlite").exists() {
        eprintln!("geto.sqlite not found at ../server/data, skipping postgres test");
        return None;
    }

    let config = Config::from_env().unwrap();
    let pool = match init_db(&sqlite_path).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to open geto.sqlite: {}, skipping", e);
            return None;
        }
    };

    Some(Arc::new(AppState::new(config, pool)))
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_introspection_live() {
    let state = match setup_test_state().await {
        Some(s) => s,
        None => return,
    };

    let driver = match state.registry.get_driver(&state, POSTGRES_CONN_ID).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Skipping test_postgres_introspection_live (remote PG unreachable): {}", e);
            return;
        }
    };

    assert_eq!(driver.id(), "postgresql");
    let caps = driver.capabilities();
    assert!(caps.has_databases);
    assert!(caps.has_schemas);
    assert!(caps.supports_returning);

    // 1. list_databases
    let dbs = driver.list_databases().await.expect("list_databases failed");
    assert!(!dbs.is_empty(), "Databases should not be empty");
    println!("Postgres databases found: {}", dbs.len());
    for d in &dbs {
        println!("  db: {} (owner: {}, size: {})", d.name, d.owner, d.size);
    }

    // 2. list_schemas
    let schemas = driver.list_schemas().await.expect("list_schemas failed");
    assert!(schemas.contains(&"public".to_string()), "Must contain public schema");

    // 3. get_tree
    let tree = driver.get_tree(None).await.expect("get_tree failed");
    println!("Postgres tree found {} schemas", tree.len());

    // 4. get_completion
    let completion = driver.get_completion().await.expect("get_completion failed");
    println!(
        "Postgres completion: {} tables, {} cols, {} funcs, {} fks",
        completion.tables.len(),
        completion.columns.len(),
        completion.functions.len(),
        completion.foreign_keys.len()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_query_execution_live() {
    let state = match setup_test_state().await {
        Some(s) => s,
        None => return,
    };

    let driver = match state.registry.get_driver(&state, POSTGRES_CONN_ID).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Skipping test_postgres_query_execution_live: {}", e);
            return;
        }
    };

    // Test data types marshaling: int, text, bool, now()
    let res = driver
        .exec_query(
            "SELECT 42::int4 AS num, 'geto'::text AS name, true AS active, NOW() AS ts",
            &[],
        )
        .await
        .expect("exec_query failed");

    assert_eq!(res.columns.len(), 4);
    assert_eq!(res.rows.len(), 1);
    assert_eq!(res.rows[0][0], json!(42));
    assert_eq!(res.rows[0][1], json!("geto"));
    assert_eq!(res.rows[0][2], json!(true));
    assert!(res.rows[0][3].is_string());
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_temporary_table_crud_lifecycle() {
    let state = match setup_test_state().await {
        Some(s) => s,
        None => return,
    };

    let driver = match state.registry.get_driver(&state, POSTGRES_CONN_ID).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Skipping test_postgres_temporary_table_crud_lifecycle: {}", e);
            return;
        }
    };

    let tmp_table = format!("test_geto_tmp_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);

    // 1. Create temporary table
    let ddl = format!(
        "CREATE TABLE public.{} (id SERIAL PRIMARY KEY, title TEXT NOT NULL, is_done BOOLEAN DEFAULT false)",
        tmp_table
    );
    driver.exec_query(&ddl, &[]).await.expect("Failed to create temp table");

    // 2. Inspect table detail
    let detail = driver.get_table_detail(Some("public"), &tmp_table).await.expect("get_table_detail failed");
    assert_eq!(detail.columns.len(), 3);
    assert_eq!(detail.primary_key, vec!["id"]);

    // 3. Insert row
    let mut insert_vals = serde_json::Map::new();
    insert_vals.insert("title".to_string(), json!("Task 1"));
    insert_vals.insert("is_done".to_string(), json!(false));
    let (ins_res, _) = driver.insert_row(Some("public"), &tmp_table, &insert_vals).await.expect("insert_row failed");
    assert_eq!(ins_res.rows.len(), 1);
    let inserted_id = ins_res.rows[0][0].as_i64().expect("Expected serial id");

    // 4. Read rows
    let rows_res = driver.get_table_data(Some("public"), &tmp_table, TableDataOptions {
        limit: 10,
        offset: 0,
        order_by: Some("id".to_string()),
        order_dir: Some("ASC".to_string()),
        filter_column: None,
        filter_value: None,
    }).await.expect("get_table_data failed");
    assert_eq!(rows_res.rows.len(), 1);
    assert_eq!(rows_res.rows[0][1], json!("Task 1"));

    // 5. Update row
    let mut pk = serde_json::Map::new();
    pk.insert("id".to_string(), json!(inserted_id));
    let mut update_vals = serde_json::Map::new();
    update_vals.insert("is_done".to_string(), json!(true));
    let (upd_res, _) = driver.update_row(Some("public"), &tmp_table, &pk, &update_vals).await.expect("update_row failed");
    assert_eq!(upd_res.rows.len(), 1);
    assert_eq!(upd_res.rows[0][2], json!(true));

    // 6. Delete row
    let (del_res, _) = driver.delete_row(Some("public"), &tmp_table, &pk).await.expect("delete_row failed");
    assert_eq!(del_res.rows.len(), 1);

    // 7. Verify empty
    let empty_res = driver.get_table_data(Some("public"), &tmp_table, TableDataOptions {
        limit: 10,
        offset: 0,
        order_by: None,
        order_dir: None,
        filter_column: None,
        filter_value: None,
    }).await.expect("get_table_data failed");
    assert_eq!(empty_res.rows.len(), 0);

    // 8. Cleanup temporary table
    let drop_ddl = format!("DROP TABLE IF EXISTS public.{}", tmp_table);
    driver.exec_query(&drop_ddl, &[]).await.expect("Failed to drop temp table");
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_database_management_routes() {
    let state = match setup_test_state().await {
        Some(s) => s,
        None => return,
    };
    let app = build_app(state.clone());
    let cookie_header = format!("geto_session={}", state.session_token);

    // Test creating a temporary test database (with random name)
    let tmp_db_name = format!("test_db_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);

    // POST /api/connections/:id/databases
    let create_req = Request::builder()
        .method("POST")
        .uri(format!("/api/connections/{}/databases", POSTGRES_CONN_ID))
        .header(header::COOKIE, &cookie_header)
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&json!({ "name": tmp_db_name })).unwrap()))
        .unwrap();
    let create_resp = app.clone().oneshot(create_req).await.unwrap();

    // If cloud PostgreSQL (like Neon) allows or forbids CREATE DATABASE:
    if create_resp.status() == StatusCode::OK {
        let body = create_resp.into_body().collect().await.unwrap().to_bytes();
        let val: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(val["created"], true);
        assert_eq!(val["name"], tmp_db_name);

        // DELETE /api/connections/:id/databases/:name (CLEANUP TEMPORARY DB ONLY!)
        let drop_req = Request::builder()
            .method("DELETE")
            .uri(format!("/api/connections/{}/databases/{}", POSTGRES_CONN_ID, tmp_db_name))
            .header(header::COOKIE, &cookie_header)
            .body(Body::empty())
            .unwrap();
        let drop_resp = app.clone().oneshot(drop_req).await.unwrap();
        assert_eq!(drop_resp.status(), StatusCode::OK);
        let drop_body = drop_resp.into_body().collect().await.unwrap().to_bytes();
        let drop_val: Value = serde_json::from_slice(&drop_body).unwrap();
        assert_eq!(drop_val["dropped"], true);
    } else {
        println!("Note: Provider restricted CREATE DATABASE (common on managed/serverless cloud Postgres like Neon): status {}", create_resp.status());
    }
}

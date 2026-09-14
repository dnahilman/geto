use std::path::PathBuf;
use std::sync::Arc;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use geto_server::build_app;
use geto_server::config::Config;
use geto_server::db::drivers::mysql::introspect::{parse_enum_values, parse_show_create_table};
use geto_server::state::AppState;
use geto_server::store::db::init_db;

#[test]
fn test_parse_show_create_table_single_key_and_fk() {
    let ddl = r#"CREATE TABLE `kdr_t_ases_pradinas_pertanyaan` (
  `c_ases_pradinas_pertanyaan_id` int(11) NOT NULL AUTO_INCREMENT,
  `c_ases_pradinas_pertanyaan_category_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`c_ases_pradinas_pertanyaan_id`) USING BTREE,
  CONSTRAINT `kdr_t_ases_pradinas_pertanyaan_ibfk_1` FOREIGN KEY (`c_ases_pradinas_pertanyaan_category_id`) REFERENCES `kdr_t_ases_pradinas_pertanyaan_category` (`c_ases_pradinas_pertanyaan_category_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8"#;

    let (constraints, foreign_keys) =
        parse_show_create_table(ddl, "kondektur", "kdr_t_ases_pradinas_pertanyaan");

    assert_eq!(constraints.len(), 2);
    assert_eq!(constraints[0].name, "PRIMARY");
    assert_eq!(constraints[0].r#type, "PRIMARY KEY");
    assert_eq!(
        constraints[0].definition,
        "PRIMARY KEY (`c_ases_pradinas_pertanyaan_id`)"
    );

    assert_eq!(constraints[1].name, "kdr_t_ases_pradinas_pertanyaan_ibfk_1");
    assert_eq!(constraints[1].r#type, "FOREIGN KEY");
    assert_eq!(
        constraints[1].definition,
        "FOREIGN KEY (`c_ases_pradinas_pertanyaan_category_id`) REFERENCES `kondektur`.`kdr_t_ases_pradinas_pertanyaan_category` (`c_ases_pradinas_pertanyaan_category_id`)"
    );

    assert_eq!(foreign_keys.len(), 1);
    assert_eq!(foreign_keys[0].schema, "kondektur");
    assert_eq!(foreign_keys[0].table, "kdr_t_ases_pradinas_pertanyaan");
    assert_eq!(
        foreign_keys[0].columns,
        vec!["c_ases_pradinas_pertanyaan_category_id"]
    );
    assert_eq!(foreign_keys[0].ref_schema, "kondektur");
    assert_eq!(
        foreign_keys[0].ref_table,
        "kdr_t_ases_pradinas_pertanyaan_category"
    );
    assert_eq!(
        foreign_keys[0].ref_columns,
        vec!["c_ases_pradinas_pertanyaan_category_id"]
    );
}

#[test]
fn test_parse_show_create_table_composite_key_and_cross_schema() {
    let ddl = r#"CREATE TABLE `role_has_permissions` (
  `permission_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`permission_id`, `role_id`),
  KEY `role_has_permissions_role_id_foreign` (`role_id`),
  CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `auth_db`.`permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"#;

    let (constraints, foreign_keys) =
        parse_show_create_table(ddl, "main_db", "role_has_permissions");

    assert_eq!(constraints.len(), 3);
    assert_eq!(constraints[0].name, "PRIMARY");
    assert_eq!(
        constraints[0].definition,
        "PRIMARY KEY (`permission_id`, `role_id`)"
    );

    assert_eq!(constraints[1].name, "role_has_permissions_permission_id_foreign");
    assert_eq!(
        constraints[1].definition,
        "FOREIGN KEY (`permission_id`) REFERENCES `auth_db`.`permissions` (`id`)"
    );

    assert_eq!(constraints[2].name, "role_has_permissions_role_id_foreign");
    assert_eq!(
        constraints[2].definition,
        "FOREIGN KEY (`role_id`) REFERENCES `main_db`.`roles` (`id`)"
    );

    assert_eq!(foreign_keys.len(), 2);
    assert_eq!(foreign_keys[0].ref_schema, "auth_db");
    assert_eq!(foreign_keys[0].ref_table, "permissions");
    assert_eq!(foreign_keys[1].ref_schema, "main_db");
    assert_eq!(foreign_keys[1].ref_table, "roles");
}

#[test]
fn test_parse_show_create_table_unique_and_check() {
    let ddl = r#"CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `age` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  CONSTRAINT `users_age_check` CHECK (`age` >= 18)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"#;

    let (constraints, _) = parse_show_create_table(ddl, "public", "users");
    assert_eq!(constraints.len(), 3);
    assert_eq!(constraints[0].name, "PRIMARY");
    assert_eq!(constraints[1].name, "users_email_unique");
    assert_eq!(constraints[1].r#type, "UNIQUE");
    assert_eq!(constraints[2].name, "users_age_check");
    assert_eq!(constraints[2].r#type, "CHECK");
}

#[test]
fn test_parse_enum_values() {
    let values = parse_enum_values("enum('draft','in_review','approved','rejected')");
    assert_eq!(
        values,
        Some(vec![
            "draft".to_string(),
            "in_review".to_string(),
            "approved".to_string(),
            "rejected".to_string()
        ])
    );

    let not_enum = parse_enum_values("varchar(255)");
    assert_eq!(not_enum, None);
}

#[tokio::test]
async fn test_mysql_meta_routes_against_saved_database() {
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

    // 1. GET /api/connections/:id/schemas
    let req = Request::builder()
        .uri(format!("/api/connections/{}/schemas", conn_id))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    if res.status() != StatusCode::OK {
        eprintln!("Remote MySQL not reachable (status {}), skipping live assertions", res.status());
        return;
    }

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let schemas: Vec<String> = serde_json::from_slice(&body).unwrap();
    assert!(schemas.contains(&"kondektur".to_string()));

    // 2. GET /api/connections/:id/tree
    let req = Request::builder()
        .uri(format!("/api/connections/{}/tree", conn_id))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let tree: Value = serde_json::from_slice(&body).unwrap();
    assert!(tree.is_array());
    let tree_arr = tree.as_array().unwrap();
    assert!(!tree_arr.is_empty());

    // 3. GET /api/connections/:id/tables/kondektur/kdr_t_ases_pradinas_approval
    let req = Request::builder()
        .uri(format!(
            "/api/connections/{}/tables/kondektur/kdr_t_ases_pradinas_approval",
            conn_id
        ))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let detail: Value = serde_json::from_slice(&body).unwrap();
    assert!(detail.get("columns").unwrap().is_array());
    assert!(detail.get("primaryKey").unwrap().is_array());
    assert!(detail.get("foreignKeys").unwrap().is_array());
    assert!(detail.get("constraints").unwrap().is_array());

    let columns = detail.get("columns").unwrap().as_array().unwrap();
    assert!(!columns.is_empty());
    println!("Successfully introspected table with {} columns!", columns.len());

    // 4. GET /api/connections/:id/completion
    let req = Request::builder()
        .uri(format!("/api/connections/{}/completion", conn_id))
        .header(header::COOKIE, &cookie_header)
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let completion: Value = serde_json::from_slice(&body).unwrap();
    assert!(completion.get("tables").unwrap().is_array());
    assert!(completion.get("columns").unwrap().is_array());
}

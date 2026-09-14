pub mod commands;

use std::sync::Arc;
use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use geto_core::state::CoreState;
use geto_core::store::init_db;

fn resolve_data_dir(handle: &tauri::AppHandle) -> std::path::PathBuf {
    // Attempt to load .env from current directory or workspace root
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_filename("../../../.env");
    let _ = dotenvy::from_filename("../../.env");

    if let Ok(dir) = std::env::var("GETO_DATA_DIR") {
        let p = std::path::PathBuf::from(&dir);
        if p.exists() {
            return p;
        }
        let from_root = std::path::PathBuf::from("../../../").join(&p);
        if from_root.exists() {
            return from_root;
        }
        let from_parent = std::path::PathBuf::from("../../").join(&p);
        if from_parent.exists() {
            return from_parent;
        }
    }

    // In development or if shared root data directory exists, prefer ./data
    let candidates = [
        std::path::PathBuf::from("./data"),
        std::path::PathBuf::from("../../../data"),
        std::path::PathBuf::from("../../data"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    // Default to OS standard application data directory in production
    let app_dir = handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("./data"));

    // Seed database if app_data_dir does not have geto.sqlite yet
    let target_db = app_dir.join("geto.sqlite");
    if !target_db.exists() {
        for c in &candidates {
            let src_db = c.join("geto.sqlite");
            if src_db.exists() {
                let _ = std::fs::create_dir_all(&app_dir);
                let _ = std::fs::copy(&src_db, &target_db);
                tracing::info!(
                    "Seeded database from {} to {}",
                    src_db.display(),
                    target_db.display()
                );
                break;
            }
        }
    }

    app_dir
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle();
            let data_dir = resolve_data_dir(&handle);

            if !data_dir.exists() {
                let _ = std::fs::create_dir_all(&data_dir);
            }

            let master_key = std::env::var("GETO_MASTER_KEY")
                .unwrap_or_else(|_| "geto-default-master-key-3f9a1c7e5b2d48a0d6e1".to_string());

            // Initialize SQLite store asynchronously within Tokio runtime
            let (tx, rx) = std::sync::mpsc::channel();
            let data_dir_clone = data_dir.clone();
            let master_key_clone = master_key.clone();

            tauri::async_runtime::spawn(async move {
                let pool = match init_db(&data_dir_clone).await {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("Failed to initialize database: {}", e);
                        panic!("Failed to initialize database: {}", e);
                    }
                };
                let core_state = Arc::new(CoreState::new(pool, &master_key_clone));
                let _ = tx.send(core_state);
            });

            let core_state = rx.recv().expect("Failed to receive initialized core state");
            app.manage(core_state);

            tracing::info!(
                "Geto Desktop initialized with database at {}",
                data_dir.display()
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Connections
            commands::connections::list_connections,
            commands::connections::get_connection,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::set_connection_database,
            commands::connections::test_unsaved_connection,
            commands::connections::test_saved_connection,
            commands::connections::get_connection_string,
            // Databases
            commands::databases::create_database,
            commands::databases::drop_database,
            // Metadata & Introspection
            commands::meta::list_databases,
            commands::meta::list_schemas,
            commands::meta::get_schema_tree,
            commands::meta::get_table_detail,
            commands::meta::get_completion,
            // Query execution & history
            commands::query::execute_query,
            commands::query::analyze_query,
            commands::query::list_query_history,
            commands::query::clear_query_history,
            // Table rows & DDL
            commands::tables::get_table_rows,
            commands::tables::insert_table_row,
            commands::tables::update_table_row,
            commands::tables::delete_table_row,
            commands::tables::create_table,
            commands::tables::drop_table,
            commands::tables::truncate_table,
            // Providers
            commands::providers::get_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Geto application");
}

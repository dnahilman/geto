use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use geto_server::config::Config;
use geto_server::state::AppState;
use geto_server::store::init_db;
use geto_server::build_app;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if std::env::args().nth(1).as_deref() == Some("export-openapi") {
        print!("{}", geto_server::openapi::openapi_json());
        return Ok(());
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .init();

    let config = Config::from_env().expect("Invalid configuration");
    let port = config.port;
    let node_env = config.node_env.clone();

    let sqlite_pool = init_db(&config.data_dir).await?;
    tracing::info!("SQLite store initialized at {}", config.data_dir.join("geto.sqlite").display());

    let state = Arc::new(AppState::new(config, sqlite_pool));
    let app = build_app(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("🦊 geto-server running at http://{} ({})", addr, node_env);

    axum::serve(listener, app).await?;

    Ok(())
}

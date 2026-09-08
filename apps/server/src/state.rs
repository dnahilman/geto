use std::sync::Arc;
use sqlx::SqlitePool;

use crate::config::Config;
use crate::crypto::SecretCipher;
use crate::db::DriverRegistry;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub cipher: SecretCipher,
    pub sqlite_pool: SqlitePool,
    pub session_token: String,
    pub registry: Arc<DriverRegistry>,
}

impl AppState {
    pub fn new(config: Config, sqlite_pool: SqlitePool) -> Self {
        let cipher = SecretCipher::new(&config.master_key);
        let session_token = crate::auth::generate_session_token(&config.master_key);
        let registry = Arc::new(DriverRegistry::new());
        Self {
            config,
            cipher,
            sqlite_pool,
            session_token,
            registry,
        }
    }
}

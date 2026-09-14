use std::sync::Arc;
use sqlx::SqlitePool;

use crate::config::Config;
use crate::crypto::SecretCipher;
use crate::db::DriverRegistry;
use geto_core::state::CoreState;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub cipher: SecretCipher,
    pub sqlite_pool: SqlitePool,
    pub session_token: String,
    pub registry: Arc<DriverRegistry>,
    pub core: CoreState,
}

impl AppState {
    pub fn new(config: Config, sqlite_pool: SqlitePool) -> Self {
        let core = CoreState::new(sqlite_pool.clone(), &config.master_key);
        let session_token = crate::auth::generate_session_token(&config.master_key);
        Self {
            config,
            cipher: core.cipher.clone(),
            sqlite_pool,
            session_token,
            registry: core.registry.clone(),
            core,
        }
    }
}

impl geto_core::db::ConnectionSecretsProvider for AppState {
    fn sqlite_pool(&self) -> &SqlitePool {
        &self.sqlite_pool
    }
    fn cipher(&self) -> &SecretCipher {
        &self.cipher
    }
}

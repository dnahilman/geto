use std::sync::Arc;
use sqlx::SqlitePool;

use crate::crypto::SecretCipher;
use crate::db::DriverRegistry;

#[derive(Clone)]
pub struct CoreState {
    pub sqlite_pool: SqlitePool,
    pub cipher: SecretCipher,
    pub registry: Arc<DriverRegistry>,
}

impl CoreState {
    pub fn new(sqlite_pool: SqlitePool, master_key: &str) -> Self {
        let cipher = SecretCipher::new(master_key);
        let registry = Arc::new(DriverRegistry::new());
        Self {
            sqlite_pool,
            cipher,
            registry,
        }
    }
}

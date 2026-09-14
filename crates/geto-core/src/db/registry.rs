use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::crypto::SecretCipher;
use crate::db::driver::DbDriver;
use crate::db::drivers::mysql::MySqlDriver;
use crate::db::drivers::postgres::PostgresDriver;
use crate::error::AppError;
use crate::state::CoreState;
use crate::store::connections::get_connection_secret;

pub trait ConnectionSecretsProvider {
    fn sqlite_pool(&self) -> &sqlx::SqlitePool;
    fn cipher(&self) -> &SecretCipher;
}

impl<T: ConnectionSecretsProvider + ?Sized> ConnectionSecretsProvider for Arc<T> {
    fn sqlite_pool(&self) -> &sqlx::SqlitePool {
        (**self).sqlite_pool()
    }
    fn cipher(&self) -> &SecretCipher {
        (**self).cipher()
    }
}

impl<T: ConnectionSecretsProvider + ?Sized> ConnectionSecretsProvider for &T {
    fn sqlite_pool(&self) -> &sqlx::SqlitePool {
        (**self).sqlite_pool()
    }
    fn cipher(&self) -> &SecretCipher {
        (**self).cipher()
    }
}

impl ConnectionSecretsProvider for CoreState {
    fn sqlite_pool(&self) -> &sqlx::SqlitePool {
        &self.sqlite_pool
    }
    fn cipher(&self) -> &SecretCipher {
        &self.cipher
    }
}

impl ConnectionSecretsProvider for (&sqlx::SqlitePool, &SecretCipher) {
    fn sqlite_pool(&self) -> &sqlx::SqlitePool {
        self.0
    }
    fn cipher(&self) -> &SecretCipher {
        self.1
    }
}

struct CachedDriver {
    driver: Arc<dyn DbDriver>,
    last_used: Instant,
}

#[derive(Default)]
pub struct DriverRegistry {
    drivers: RwLock<HashMap<String, CachedDriver>>,
}

impl DriverRegistry {
    pub fn new() -> Self {
        Self {
            drivers: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_driver(
        &self,
        provider: &impl ConnectionSecretsProvider,
        connection_id: &str,
    ) -> Result<Arc<dyn DbDriver>, AppError> {
        self.get_driver_direct(provider.sqlite_pool(), provider.cipher(), connection_id)
            .await
    }

    pub async fn get_driver_direct(
        &self,
        sqlite_pool: &sqlx::SqlitePool,
        cipher: &SecretCipher,
        connection_id: &str,
    ) -> Result<Arc<dyn DbDriver>, AppError> {
        // 1. Fast path: check read lock
        {
            let mut guard = self.drivers.write().await;
            if let Some(cached) = guard.get_mut(connection_id) {
                cached.last_used = Instant::now();
                return Ok(cached.driver.clone());
            }
        }

        // 2. Fetch secret from database store
        let secret = get_connection_secret(sqlite_pool, cipher, connection_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Connection not found".to_string()))?;

        // 3. Instantiate driver based on provider
        let driver: Arc<dyn DbDriver> = match secret.connection.provider.as_str() {
            "mysql" => {
                let d = MySqlDriver::connect(&secret).await?;
                Arc::new(d)
            }
            "postgresql" | "postgres" => {
                let d = PostgresDriver::connect(&secret).await?;
                Arc::new(d)
            }
            other => {
                return Err(AppError::BadRequest(format!("Unsupported provider: {}", other)));
            }
        };

        // 4. Cache and return
        let mut guard = self.drivers.write().await;
        guard.insert(
            connection_id.to_string(),
            CachedDriver {
                driver: driver.clone(),
                last_used: Instant::now(),
            },
        );

        Ok(driver)
    }

    pub async fn get_driver_from_state(
        &self,
        state: &CoreState,
        connection_id: &str,
    ) -> Result<Arc<dyn DbDriver>, AppError> {
        self.get_driver(state, connection_id).await
    }

    pub async fn close_driver(&self, connection_id: &str) {
        let removed = {
            let mut guard = self.drivers.write().await;
            guard.remove(connection_id)
        };

        if let Some(cached) = removed {
            cached.driver.close().await;
        }
    }

    pub async fn sweep_idle(&self, max_idle: std::time::Duration) {
        let mut to_close = Vec::new();
        {
            let mut guard = self.drivers.write().await;
            let now = Instant::now();
            guard.retain(|_id, cached| {
                if now.duration_since(cached.last_used) > max_idle {
                    to_close.push(cached.driver.clone());
                    false
                } else {
                    true
                }
            });
        }

        for driver in to_close {
            driver.close().await;
        }
    }
}

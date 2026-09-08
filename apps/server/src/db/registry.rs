use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::db::driver::DbDriver;
use crate::db::drivers::mysql::MySqlDriver;
use crate::db::drivers::postgres::PostgresDriver;
use crate::error::AppError;
use crate::state::AppState;
use crate::store::connections::get_connection_secret;

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
        state: &AppState,
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
        let secret = get_connection_secret(&state.sqlite_pool, &state.cipher, connection_id)
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

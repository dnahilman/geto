use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub connection_id: String,
    pub sql: String,
    pub started_at: String,
    pub duration_ms: Option<i64>,
    pub row_count: Option<i64>,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewHistoryEntry {
    pub connection_id: String,
    pub sql: String,
    pub started_at: String,
    pub duration_ms: Option<i64>,
    pub row_count: Option<i64>,
    pub status: String,
    pub error: Option<String>,
}

pub async fn record_history(
    pool: &SqlitePool,
    entry: NewHistoryEntry,
) -> Result<HistoryEntry, AppError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO query_history
            (id, connection_id, sql, started_at, duration_ms, row_count, status, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&entry.connection_id)
    .bind(&entry.sql)
    .bind(&entry.started_at)
    .bind(entry.duration_ms)
    .bind(entry.row_count)
    .bind(&entry.status)
    .bind(&entry.error)
    .execute(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(HistoryEntry {
        id,
        connection_id: entry.connection_id,
        sql: entry.sql,
        started_at: entry.started_at,
        duration_ms: entry.duration_ms,
        row_count: entry.row_count,
        status: entry.status,
        error: entry.error,
    })
}

pub async fn list_history(
    pool: &SqlitePool,
    connection_id: &str,
    limit: i64,
) -> Result<Vec<HistoryEntry>, AppError> {
    let rows = sqlx::query_as::<_, HistoryRow>(
        r#"
        SELECT id, connection_id, sql, started_at, duration_ms, row_count, status, error
        FROM query_history
        WHERE connection_id = ?
        ORDER BY started_at DESC
        LIMIT ?
        "#,
    )
    .bind(connection_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(rows.into_iter().map(|r| r.into()).collect())
}

pub async fn clear_history(
    pool: &SqlitePool,
    connection_id: &str,
) -> Result<u64, AppError> {
    let res = sqlx::query("DELETE FROM query_history WHERE connection_id = ?")
        .bind(connection_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(res.rows_affected())
}

#[derive(sqlx::FromRow)]
struct HistoryRow {
    id: String,
    connection_id: String,
    sql: String,
    started_at: String,
    duration_ms: Option<i64>,
    row_count: Option<i64>,
    status: String,
    error: Option<String>,
}

impl From<HistoryRow> for HistoryEntry {
    fn from(r: HistoryRow) -> Self {
        Self {
            id: r.id,
            connection_id: r.connection_id,
            sql: r.sql,
            started_at: r.started_at,
            duration_ms: r.duration_ms,
            row_count: r.row_count,
            status: r.status,
            error: r.error,
        }
    }
}

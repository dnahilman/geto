use std::time::Instant;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::db::shared::{
    analyze_sql, inspect_select, split_statements, ColumnMeta, SafetyReport,
};
use crate::db::DriverRegistry;
use crate::error::AppError;
use crate::state::CoreState;
use crate::store::history::{clear_history, list_history, record_history, HistoryEntry, NewHistoryEntry};

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QueryBody {
    pub sql: String,
    pub confirm_dangerous: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct AnalyzeBody {
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    pub index: usize,
    pub sql: String,
    pub command: Option<String>,
    pub columns: Vec<ColumnMeta>,
    #[schema(value_type = Vec<Vec<Object>>)]
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub duration_ms: u64,
    pub paginated: bool,
    pub limit: u32,
    pub offset: u32,
    #[schema(value_type = Option<Object>)]
    pub source: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(untagged)]
pub enum QueryResponse {
    ConfirmationNeeded {
        #[serde(rename = "requiresConfirmation")]
        requires_confirmation: bool,
        report: SafetyReport,
    },
    Success {
        #[serde(rename = "requiresConfirmation")]
        requires_confirmation: bool,
        results: Vec<StatementResult>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ClearHistoryResponse {
    pub deleted: u64,
}

/// Execute one or more SQL statements, handling pagination and recording history.
pub async fn execute_query(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    body: QueryBody,
) -> Result<QueryResponse, AppError> {
    let report = analyze_sql(&body.sql);
    if report.dangerous && !body.confirm_dangerous.unwrap_or(false) {
        return Ok(QueryResponse::ConfirmationNeeded {
            requires_confirmation: true,
            report,
        });
    }

    let limit = body.limit.unwrap_or(500).clamp(1, 10000);
    let offset = body.offset.unwrap_or(0);
    let stmts = split_statements(&body.sql);
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    if stmts.len() == 1 {
        let stmt = &stmts[0];
        let sel = inspect_select(stmt);
        let paginated = sel.single_select && !sel.has_limit;
        let exec_sql = if paginated {
            let clean = stmt.trim_end().trim_end_matches(';');
            format!("{}\nLIMIT {} OFFSET {}", clean, limit, offset)
        } else {
            stmt.clone()
        };

        let t0 = Instant::now();
        let started_at = Utc::now().to_rfc3339();

        match driver.exec_query(&exec_sql, &[]).await {
            Ok(res) => {
                let duration_ms = t0.elapsed().as_millis() as u64;
                let _ = record_history(
                    &state.sqlite_pool,
                    NewHistoryEntry {
                        connection_id: connection_id.to_string(),
                        sql: body.sql.clone(),
                        started_at,
                        duration_ms: Some(duration_ms as i64),
                        row_count: Some(res.row_count as i64),
                        status: "ok".to_string(),
                        error: None,
                    },
                )
                .await;

                let statement_res = StatementResult {
                    index: 0,
                    sql: stmt.clone(),
                    command: res.command,
                    columns: res.columns,
                    rows: res.rows,
                    row_count: res.row_count,
                    duration_ms,
                    paginated,
                    limit,
                    offset,
                    source: None,
                    error: None,
                };

                Ok(QueryResponse::Success {
                    requires_confirmation: false,
                    results: vec![statement_res],
                })
            }
            Err(e) => {
                let duration_ms = t0.elapsed().as_millis() as u64;
                let err_msg = e.to_string();
                let _ = record_history(
                    &state.sqlite_pool,
                    NewHistoryEntry {
                        connection_id: connection_id.to_string(),
                        sql: body.sql.clone(),
                        started_at,
                        duration_ms: Some(duration_ms as i64),
                        row_count: None,
                        status: "error".to_string(),
                        error: Some(err_msg.clone()),
                    },
                )
                .await;

                Err(e)
            }
        }
    } else {
        let mut results = Vec::new();
        for (i, stmt) in stmts.iter().enumerate() {
            let t0 = Instant::now();
            let started_at = Utc::now().to_rfc3339();

            let sel = inspect_select(stmt);
            let capped = sel.single_select && !sel.has_limit;
            let exec_sql = if capped {
                let clean = stmt.trim_end().trim_end_matches(';');
                format!("{}\nLIMIT {}", clean, limit)
            } else {
                stmt.clone()
            };

            match driver.exec_query(&exec_sql, &[]).await {
                Ok(res) => {
                    let duration_ms = t0.elapsed().as_millis() as u64;
                    let _ = record_history(
                        &state.sqlite_pool,
                        NewHistoryEntry {
                            connection_id: connection_id.to_string(),
                            sql: stmt.clone(),
                            started_at,
                            duration_ms: Some(duration_ms as i64),
                            row_count: Some(res.row_count as i64),
                            status: "ok".to_string(),
                            error: None,
                        },
                    )
                    .await;

                    results.push(StatementResult {
                        index: i,
                        sql: stmt.clone(),
                        command: res.command,
                        columns: res.columns,
                        rows: res.rows,
                        row_count: res.row_count,
                        duration_ms,
                        paginated: false,
                        limit,
                        offset: 0,
                        source: None,
                        error: None,
                    });
                }
                Err(e) => {
                    let duration_ms = t0.elapsed().as_millis() as u64;
                    let err_msg = e.to_string();
                    let _ = record_history(
                        &state.sqlite_pool,
                        NewHistoryEntry {
                            connection_id: connection_id.to_string(),
                            sql: stmt.clone(),
                            started_at,
                            duration_ms: Some(duration_ms as i64),
                            row_count: None,
                            status: "error".to_string(),
                            error: Some(err_msg.clone()),
                        },
                    )
                    .await;

                    results.push(StatementResult {
                        index: i,
                        sql: stmt.clone(),
                        command: None,
                        columns: Vec::new(),
                        rows: Vec::new(),
                        row_count: 0,
                        duration_ms,
                        paginated: false,
                        limit,
                        offset: 0,
                        source: None,
                        error: Some(err_msg),
                    });
                    break;
                }
            }
        }

        Ok(QueryResponse::Success {
            requires_confirmation: false,
            results,
        })
    }
}

/// Analyze SQL query safety.
pub fn analyze_query(sql: &str) -> SafetyReport {
    analyze_sql(sql)
}

/// List query history for a connection.
pub async fn list_query_history(
    pool: &sqlx::SqlitePool,
    connection_id: &str,
    limit: u32,
) -> Result<Vec<HistoryEntry>, AppError> {
    list_history(pool, connection_id, limit as i64).await
}

/// Clear query history for a connection.
pub async fn clear_query_history(
    pool: &sqlx::SqlitePool,
    connection_id: &str,
) -> Result<u64, AppError> {
    clear_history(pool, connection_id).await
}

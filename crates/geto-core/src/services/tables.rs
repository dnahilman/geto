use std::time::Instant;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::db::shared::QueryResult;
use crate::db::types::{ColumnSpec, TableDataOptions};
use crate::db::DriverRegistry;
use crate::error::AppError;
use crate::state::CoreState;
use crate::store::history::{record_history, NewHistoryEntry};

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct RowsQueryParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    #[serde(default, alias = "orderBy")]
    pub order_by: Option<String>,
    #[serde(default, alias = "orderDir")]
    pub order_dir: Option<String>,
    #[serde(default, alias = "filterColumn")]
    pub filter_column: Option<String>,
    #[serde(default, alias = "filterValue")]
    pub filter_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RowsResponse {
    pub result: QueryResult,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct InsertRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub values: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct UpdateRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub pk: serde_json::Map<String, serde_json::Value>,
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub values: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct DeleteRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub pk: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateTableBody {
    pub schema: String,
    pub name: String,
    pub columns: Vec<ColumnSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CreateTableResponse {
    pub created: bool,
    pub schema: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DropTableResponse {
    pub dropped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct TruncateTableResponse {
    pub truncated: bool,
}

/// Fetch paginated table rows.
pub async fn get_rows(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
    params: RowsQueryParams,
) -> Result<RowsResponse, AppError> {
    let t0 = Instant::now();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    let opts = TableDataOptions {
        limit: params.limit.unwrap_or(500).min(10000),
        offset: params.offset.unwrap_or(0),
        order_by: params.order_by,
        order_dir: params.order_dir,
        filter_column: params.filter_column,
        filter_value: params.filter_value,
    };

    let result = driver.get_table_data(Some(schema), table, opts).await?;
    let duration_ms = t0.elapsed().as_millis() as u64;

    Ok(RowsResponse {
        result,
        duration_ms,
    })
}

/// Insert a new row into the table.
pub async fn insert_row(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
    values: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.insert_row(Some(schema), table, &values).await {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(result)
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("INSERT INTO {}.{}", schema, table),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

/// Update an existing row identified by primary key.
pub async fn update_row(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
    pk: serde_json::Map<String, serde_json::Value>,
    values: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.update_row(Some(schema), table, &pk, &values).await {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(result)
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("UPDATE {}.{}", schema, table),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

/// Delete a row identified by primary key.
pub async fn delete_row(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
    pk: serde_json::Map<String, serde_json::Value>,
) -> Result<QueryResult, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.delete_row(Some(schema), table, &pk).await {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(result)
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("DELETE FROM {}.{}", schema, table),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

/// Create a new table.
pub async fn create_table(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    body: CreateTableBody,
) -> Result<CreateTableResponse, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.create_table(Some(&body.schema), &body.name, &body.columns).await {
        Ok(display_sql) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(CreateTableResponse {
                created: true,
                schema: body.schema,
                name: body.name,
            })
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("CREATE TABLE {}.{}", body.schema, body.name),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

/// Drop a table.
pub async fn drop_table(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
) -> Result<DropTableResponse, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.drop_table(Some(schema), table).await {
        Ok(display_sql) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(DropTableResponse { dropped: true })
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("DROP TABLE {}.{}", schema, table),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

/// Truncate a table.
pub async fn truncate_table(
    registry: &DriverRegistry,
    state: &CoreState,
    connection_id: &str,
    schema: &str,
    table: &str,
) -> Result<TruncateTableResponse, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = registry
        .get_driver(state, connection_id)
        .await?;

    match driver.truncate_table(Some(schema), table).await {
        Ok(display_sql) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(TruncateTableResponse { truncated: true })
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: connection_id.to_string(),
                    sql: format!("TRUNCATE TABLE {}.{}", schema, table),
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                },
            )
            .await;
            Err(e)
        }
    }
}

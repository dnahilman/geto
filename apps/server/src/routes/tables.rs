use std::sync::Arc;
use std::time::Instant;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{delete, get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::db::shared::QueryResult;
use crate::db::types::{ColumnSpec, TableDataOptions};
use crate::error::AppError;
use crate::state::AppState;
use crate::store::history::{record_history, NewHistoryEntry};

#[derive(Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct RowsQueryParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub order_by: Option<String>,
    pub order_dir: Option<String>,
    pub filter_column: Option<String>,
    pub filter_value: Option<String>,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RowsResponse {
    pub result: QueryResult,
    pub duration_ms: u64,
}

#[derive(Deserialize, Serialize, utoipa::ToSchema)]
pub struct InsertRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub values: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize, Serialize, utoipa::ToSchema)]
pub struct UpdateRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub pk: serde_json::Map<String, serde_json::Value>,
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub values: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize, Serialize, utoipa::ToSchema)]
pub struct DeleteRowBody {
    #[schema(value_type = std::collections::HashMap<String, serde_json::Value>)]
    pub pk: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize, Serialize, utoipa::ToSchema)]
pub struct CreateTableBody {
    pub schema: String,
    pub name: String,
    pub columns: Vec<ColumnSpec>,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct CreateTableResponse {
    pub created: bool,
    pub schema: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct DropTableResponse {
    pub dropped: bool,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct TruncateTableResponse {
    pub truncated: bool,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/connections/{id}/tables/{schema}/{table}/rows",
            get(get_rows_handler)
                .post(insert_row_handler)
                .patch(update_row_handler)
                .delete(delete_row_handler),
        )
        .route(
            "/connections/{id}/tables/{schema}/{table}/truncate",
            post(truncate_table_handler),
        )
        .route(
            "/connections/{id}/tables/{schema}/{table}",
            delete(drop_table_handler),
        )
        .route("/connections/{id}/tables", post(create_table_handler))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/tables/{schema}/{table}/rows",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name"),
        RowsQueryParams
    ),
    responses(
        (status = 200, description = "Fetch rows from table", body = RowsResponse),
        (status = 404, description = "Table not found")
    )
)]
pub async fn get_rows_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
    Query(q): Query<RowsQueryParams>,
) -> Result<Json<RowsResponse>, AppError> {
    let t0 = Instant::now();
    let driver = state.registry.get_driver(&state, &id).await?;

    let opts = TableDataOptions {
        limit: q.limit.unwrap_or(500).min(10000),
        offset: q.offset.unwrap_or(0),
        order_by: q.order_by,
        order_dir: q.order_dir,
        filter_column: q.filter_column,
        filter_value: q.filter_value,
    };

    let result = driver.get_table_data(Some(&schema), &table, opts).await?;
    let duration_ms = t0.elapsed().as_millis() as u64;

    Ok(Json(RowsResponse {
        result,
        duration_ms,
    }))
}

#[utoipa::path(
    post,
    path = "/api/connections/{id}/tables/{schema}/{table}/rows",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    request_body = InsertRowBody,
    responses(
        (status = 200, description = "Insert row into table", body = QueryResult),
        (status = 400, description = "Execution error")
    )
)]
pub async fn insert_row_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
    Json(body): Json<InsertRowBody>,
) -> Result<Json<QueryResult>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver.insert_row(Some(&schema), &table, &body.values).await {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(result))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

#[utoipa::path(
    patch,
    path = "/api/connections/{id}/tables/{schema}/{table}/rows",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    request_body = UpdateRowBody,
    responses(
        (status = 200, description = "Update row in table", body = QueryResult),
        (status = 400, description = "Execution error")
    )
)]
pub async fn update_row_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
    Json(body): Json<UpdateRowBody>,
) -> Result<Json<QueryResult>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver
        .update_row(Some(&schema), &table, &body.pk, &body.values)
        .await
    {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(result))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

#[utoipa::path(
    delete,
    path = "/api/connections/{id}/tables/{schema}/{table}/rows",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    request_body = DeleteRowBody,
    responses(
        (status = 200, description = "Delete row from table", body = QueryResult),
        (status = 400, description = "Execution error")
    )
)]
pub async fn delete_row_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
    Json(body): Json<DeleteRowBody>,
) -> Result<Json<QueryResult>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver.delete_row(Some(&schema), &table, &body.pk).await {
        Ok((result, display_sql)) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: display_sql,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: Some(result.row_count as i64),
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(result))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

#[utoipa::path(
    post,
    path = "/api/connections/{id}/tables",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = CreateTableBody,
    responses(
        (status = 200, description = "Create new table", body = CreateTableResponse),
        (status = 400, description = "Execution error")
    )
)]
pub async fn create_table_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateTableBody>,
) -> Result<Json<CreateTableResponse>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver
        .create_table(Some(&body.schema), &body.name, &body.columns)
        .await
    {
        Ok(ddl) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: ddl,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(CreateTableResponse {
                created: true,
                schema: body.schema,
                name: body.name,
            }))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

#[utoipa::path(
    delete,
    path = "/api/connections/{id}/tables/{schema}/{table}",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    responses(
        (status = 200, description = "Drop table", body = DropTableResponse),
        (status = 400, description = "Execution error")
    )
)]
pub async fn drop_table_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
) -> Result<Json<DropTableResponse>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver.drop_table(Some(&schema), &table).await {
        Ok(ddl) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: ddl,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(DropTableResponse { dropped: true }))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

#[utoipa::path(
    post,
    path = "/api/connections/{id}/tables/{schema}/{table}/truncate",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    responses(
        (status = 200, description = "Truncate table", body = TruncateTableResponse),
        (status = 400, description = "Execution error")
    )
)]
pub async fn truncate_table_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
) -> Result<Json<TruncateTableResponse>, AppError> {
    let t0 = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let driver = state.registry.get_driver(&state, &id).await?;

    match driver.truncate_table(Some(&schema), &table).await {
        Ok(ddl) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
                    sql: ddl,
                    started_at,
                    duration_ms: Some(duration_ms),
                    row_count: None,
                    status: "ok".to_string(),
                    error: None,
                },
            )
            .await;
            Ok(Json(TruncateTableResponse { truncated: true }))
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as i64;
            let _ = record_history(
                &state.sqlite_pool,
                NewHistoryEntry {
                    connection_id: id,
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

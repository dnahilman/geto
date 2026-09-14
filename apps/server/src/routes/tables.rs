use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{delete, get, post},
    Router,
};

pub use geto_core::services::tables::{
    CreateTableBody, CreateTableResponse, DeleteRowBody, DropTableResponse, InsertRowBody,
    RowsQueryParams, RowsResponse, TruncateTableResponse, UpdateRowBody,
};
use geto_core::db::shared::QueryResult;
use crate::error::AppError;
use crate::state::AppState;

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
    let res = geto_core::services::tables::get_rows(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
        q,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::insert_row(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
        body.values,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::update_row(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
        body.pk,
        body.values,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::delete_row(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
        body.pk,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::create_table(
        &state.registry,
        &state.core,
        &id,
        body,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::drop_table(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
    )
    .await?;
    Ok(Json(res))
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
    let res = geto_core::services::tables::truncate_table(
        &state.registry,
        &state.core,
        &id,
        &schema,
        &table,
    )
    .await?;
    Ok(Json(res))
}

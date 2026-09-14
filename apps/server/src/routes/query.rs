use std::sync::Arc;
use axum::{
    extract::{Path, State},
    response::Json,
    routing::{get, post},
    Router,
};

pub use geto_core::services::query::{
    AnalyzeBody, ClearHistoryResponse, QueryBody, QueryResponse, StatementResult,
};
use geto_core::db::shared::SafetyReport;
use geto_core::store::history::HistoryEntry;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/connections/{id}/query", post(query_handler))
        .route("/connections/{id}/query/analyze", post(analyze_handler))
        .route(
            "/connections/{id}/history",
            get(list_history_handler).delete(clear_history_handler),
        )
}

#[utoipa::path(
    post,
    path = "/api/connections/{id}/query",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = QueryBody,
    responses(
        (status = 200, description = "Execute SQL query", body = QueryResponse),
        (status = 400, description = "Query execution error")
    )
)]
pub async fn query_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<QueryBody>,
) -> Result<Json<QueryResponse>, AppError> {
    let res = geto_core::services::query::execute_query(
        &state.registry,
        &state.core,
        &id,
        body,
    )
    .await?;
    Ok(Json(res))
}

#[utoipa::path(
    post,
    path = "/api/connections/{id}/query/analyze",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    request_body = AnalyzeBody,
    responses(
        (status = 200, description = "Analyze SQL safety", body = SafetyReport)
    )
)]
pub async fn analyze_handler(
    Json(body): Json<AnalyzeBody>,
) -> Json<SafetyReport> {
    Json(geto_core::services::query::analyze_query(&body.sql))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/history",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "List query execution history", body = Vec<HistoryEntry>),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn list_history_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<HistoryEntry>>, AppError> {
    let history = geto_core::services::query::list_query_history(&state.sqlite_pool, &id, 100).await?;
    Ok(Json(history))
}

#[utoipa::path(
    delete,
    path = "/api/connections/{id}/history",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "Clear query history", body = ClearHistoryResponse),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn clear_history_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ClearHistoryResponse>, AppError> {
    let count = geto_core::services::query::clear_query_history(&state.sqlite_pool, &id).await?;
    Ok(Json(ClearHistoryResponse { deleted: count }))
}

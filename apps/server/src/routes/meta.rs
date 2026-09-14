use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::get,
    Router,
};

pub use geto_core::services::meta::TreeQuery;
use geto_core::db::types::{
    CompletionResponse, DatabaseInfo, SchemaTree, TableDetailResponse,
};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/connections/{id}/databases", get(list_databases_handler))
        .route("/connections/{id}/schemas", get(list_schemas_handler))
        .route("/connections/{id}/tree", get(get_tree_handler))
        .route(
            "/connections/{id}/tables/{schema}/{table}",
            get(get_table_detail_handler),
        )
        .route("/connections/{id}/completion", get(get_completion_handler))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/databases",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "List databases in connection", body = Vec<DatabaseInfo>),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn list_databases_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<DatabaseInfo>>, AppError> {
    let databases = geto_core::services::meta::list_databases(&state.registry, &state.core, &id).await?;
    Ok(Json(databases))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/schemas",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "List schemas in connection", body = Vec<String>),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn list_schemas_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<String>>, AppError> {
    let schemas = geto_core::services::meta::list_schemas(&state.registry, &state.core, &id).await?;
    Ok(Json(schemas))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/tree",
    params(
        ("id" = String, Path, description = "Connection ID"),
        TreeQuery
    ),
    responses(
        (status = 200, description = "Get database schema tree", body = Vec<SchemaTree>),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn get_tree_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<TreeQuery>,
) -> Result<Json<Vec<SchemaTree>>, AppError> {
    let tree = geto_core::services::meta::get_tree(&state.registry, &state.core, &id, q.search.as_deref()).await?;
    Ok(Json(tree))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/tables/{schema}/{table}",
    params(
        ("id" = String, Path, description = "Connection ID"),
        ("schema" = String, Path, description = "Schema name"),
        ("table" = String, Path, description = "Table name")
    ),
    responses(
        (status = 200, description = "Get table details (columns, indexes, constraints)", body = TableDetailResponse),
        (status = 404, description = "Table or connection not found")
    )
)]
pub async fn get_table_detail_handler(
    State(state): State<Arc<AppState>>,
    Path((id, schema, table)): Path<(String, String, String)>,
) -> Result<Json<TableDetailResponse>, AppError> {
    let detail = geto_core::services::meta::get_table_detail(&state.registry, &state.core, &id, &schema, &table).await?;
    Ok(Json(detail))
}

#[utoipa::path(
    get,
    path = "/api/connections/{id}/completion",
    params(
        ("id" = String, Path, description = "Connection ID")
    ),
    responses(
        (status = 200, description = "Get auto-completion metadata", body = CompletionResponse),
        (status = 404, description = "Connection not found")
    )
)]
pub async fn get_completion_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<CompletionResponse>, AppError> {
    let completion = geto_core::services::meta::get_completion(&state.registry, &state.core, &id).await?;
    Ok(Json(completion))
}

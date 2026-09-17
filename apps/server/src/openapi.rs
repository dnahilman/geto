use axum::{response::Json, routing::get, Router};
use std::sync::Arc;
use utoipa::OpenApi;

use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Geto API",
        version = "0.5.0",
        description = "Geto Database Management Tool API"
    ),
    paths(
        crate::routes::health,
        crate::auth::handlers::login,
        crate::auth::handlers::logout,
        crate::auth::handlers::me,
        crate::routes::providers::get_providers,
        crate::routes::connections::list_handler,
        crate::routes::connections::create_handler,
        crate::routes::connections::get_handler,
        crate::routes::connections::update_handler,
        crate::routes::connections::delete_handler,
        crate::routes::connections::set_database_handler,
        crate::routes::connections::test_unsaved_handler,
        crate::routes::connections::test_saved_handler,
        crate::routes::connections::connection_string_handler,
        crate::routes::databases::create_database_handler,
        crate::routes::databases::drop_database_handler,
        crate::routes::meta::list_databases_handler,
        crate::routes::meta::list_schemas_handler,
        crate::routes::meta::get_tree_handler,
        crate::routes::meta::get_table_detail_handler,
        crate::routes::meta::get_completion_handler,
        crate::routes::tables::get_rows_handler,
        crate::routes::tables::insert_row_handler,
        crate::routes::tables::update_row_handler,
        crate::routes::tables::delete_row_handler,
        crate::routes::tables::create_table_handler,
        crate::routes::tables::drop_table_handler,
        crate::routes::tables::truncate_table_handler,
        crate::routes::query::query_handler,
        crate::routes::query::analyze_handler,
        crate::routes::query::list_history_handler,
        crate::routes::query::clear_history_handler,
    ),
    components(
        schemas(
            crate::routes::HealthResponse,
            crate::auth::handlers::LoginInput,
            crate::auth::handlers::AuthStatus,
            crate::store::connections::Connection,
            crate::store::connections::ConnectionInput,
            crate::store::connections::SslMode,
            crate::store::connections::SshConfig,
            crate::store::connections::SshInput,
            crate::store::connections::SshAuthMethod,
            crate::routes::connections::SetDatabaseInput,
            crate::routes::connections::DeleteResponse,
            crate::routes::connections::ConnectionStringResponse,
            crate::routes::connections::TestResult,
            crate::routes::databases::CreateDatabaseRequest,
            crate::routes::databases::CreateDatabaseResponse,
            crate::routes::databases::DropDatabaseResponse,
            crate::routes::providers::ProviderMeta,
            crate::db::types::DatabaseInfo,
            crate::db::types::RelationType,
            crate::db::types::RelationEntry,
            crate::db::types::SchemaTree,
            crate::db::types::ColumnInfo,
            crate::db::types::IndexInfo,
            crate::db::types::ConstraintInfo,
            crate::db::types::CompletionColumn,
            crate::db::types::CompletionFunction,
            crate::db::types::CompletionForeignKey,
            crate::db::types::TableDetailResponse,
            crate::db::types::CompletionTable,
            crate::db::types::CompletionResponse,
            crate::db::types::ColumnSpec,
            crate::db::types::TableDataOptions,
            crate::routes::tables::RowsResponse,
            crate::routes::tables::InsertRowBody,
            crate::routes::tables::UpdateRowBody,
            crate::routes::tables::DeleteRowBody,
            crate::routes::tables::CreateTableBody,
            crate::routes::tables::CreateTableResponse,
            crate::routes::tables::DropTableResponse,
            crate::routes::tables::TruncateTableResponse,
            crate::db::shared::ColumnMeta,
            crate::db::shared::QueryResult,
            crate::db::shared::StatementRisk,
            crate::db::shared::SafetyReport,
            crate::routes::query::QueryBody,
            crate::routes::query::AnalyzeBody,
            crate::routes::query::StatementResult,
            crate::routes::query::QueryResponse,
            crate::routes::query::ClearHistoryResponse,
            crate::store::history::HistoryEntry,
        )
    )
)]
pub struct ApiDoc;

pub fn openapi_json() -> String {
    ApiDoc::openapi().to_pretty_json().expect("Failed to serialize OpenAPI doc")
}

async fn get_openapi() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/openapi.json", get(get_openapi))
}

use serde::Serialize;

use crate::db::shared::QueryResult;
use crate::db::types::{
    ColumnInfo, ColumnSpec, CompletionColumn, CompletionForeignKey, CompletionFunction,
    CompletionResponse, ConstraintInfo, DatabaseInfo, IndexInfo, SchemaTree, TableDataOptions,
    TableDetailResponse,
};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub kind: String,
    pub has_databases: bool,
    pub has_schemas: bool,
    pub has_functions: bool,
    pub supports_database_switch: bool,
    pub supports_returning: bool,
    pub connection_shape: String,
}

#[async_trait::async_trait]
pub trait DbDriver: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> Capabilities;

    // Introspection
    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError>;
    async fn list_schemas(&self) -> Result<Vec<String>, AppError>;
    async fn get_tree(&self, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError>;
    async fn get_columns(&self, schema: Option<&str>, table: &str) -> Result<Vec<ColumnInfo>, AppError>;
    async fn get_indexes(&self, schema: Option<&str>, table: &str) -> Result<Vec<IndexInfo>, AppError>;
    async fn get_constraints(&self, schema: Option<&str>, table: &str) -> Result<Vec<ConstraintInfo>, AppError>;
    async fn get_table_foreign_keys(&self, schema: Option<&str>, table: &str) -> Result<Vec<CompletionForeignKey>, AppError>;
    async fn get_table_detail(&self, schema: Option<&str>, table: &str) -> Result<TableDetailResponse, AppError>;
    async fn get_all_columns(&self) -> Result<Vec<CompletionColumn>, AppError>;
    async fn get_functions(&self) -> Result<Vec<CompletionFunction>, AppError>;
    async fn get_foreign_keys(&self) -> Result<Vec<CompletionForeignKey>, AppError>;
    async fn get_completion(&self) -> Result<CompletionResponse, AppError>;

    // Data viewer & DML
    async fn get_table_data(&self, schema: Option<&str>, table: &str, opts: TableDataOptions) -> Result<QueryResult, AppError>;
    async fn exec_query(&self, sql: &str, params: &[serde_json::Value]) -> Result<QueryResult, AppError>;
    async fn insert_row(&self, schema: Option<&str>, table: &str, values: &serde_json::Map<String, serde_json::Value>) -> Result<(QueryResult, String), AppError>;
    async fn update_row(&self, schema: Option<&str>, table: &str, pk: &serde_json::Map<String, serde_json::Value>, values: &serde_json::Map<String, serde_json::Value>) -> Result<(QueryResult, String), AppError>;
    async fn delete_row(&self, schema: Option<&str>, table: &str, pk: &serde_json::Map<String, serde_json::Value>) -> Result<(QueryResult, String), AppError>;
    async fn create_table(&self, schema: Option<&str>, table: &str, columns: &[ColumnSpec]) -> Result<String, AppError>;
    async fn drop_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError>;
    async fn truncate_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError>;
    async fn create_database(&self, name: &str) -> Result<(), AppError>;
    async fn drop_database(&self, name: &str) -> Result<(), AppError>;
    fn quote_ident(&self, name: &str) -> String;

    async fn close(&self);
}

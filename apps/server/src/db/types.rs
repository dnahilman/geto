use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub owner: String,
    pub size: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum RelationType {
    Table,
    View,
    Matview,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RelationEntry {
    pub name: String,
    pub r#type: RelationType,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemaTree {
    pub schema: String,
    pub relations: Vec<RelationEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub r#type: String,
    pub not_null: bool,
    pub default: Option<String>,
    pub ordinal: i32,
    pub is_primary_key: bool,
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub definition: String,
    pub is_unique: bool,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintInfo {
    pub name: String,
    pub r#type: String,
    pub definition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletionColumn {
    pub schema: String,
    pub table: String,
    pub name: String,
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletionFunction {
    pub schema: String,
    pub name: String,
    pub args: String,
    pub returns: String,
    pub kind: String, // "function", "procedure", "aggregate", "window"
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletionForeignKey {
    pub schema: String,
    pub table: String,
    pub columns: Vec<String>,
    pub ref_schema: String,
    pub ref_table: String,
    pub ref_columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TableDetailResponse {
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub constraints: Vec<ConstraintInfo>,
    pub primary_key: Vec<String>,
    pub foreign_keys: Vec<CompletionForeignKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletionTable {
    pub schema: String,
    pub name: String,
    pub r#type: RelationType,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub tables: Vec<CompletionTable>,
    pub columns: Vec<CompletionColumn>,
    pub functions: Vec<CompletionFunction>,
    pub foreign_keys: Vec<CompletionForeignKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSpec {
    pub name: String,
    pub r#type: String,
    pub not_null: Option<bool>,
    pub default: Option<String>,
    pub primary_key: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TableDataOptions {
    pub limit: u32,
    pub offset: u32,
    pub order_by: Option<String>,
    pub order_dir: Option<String>,
    pub filter_column: Option<String>,
    pub filter_value: Option<String>,
}

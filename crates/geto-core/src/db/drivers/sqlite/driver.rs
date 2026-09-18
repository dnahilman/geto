use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

use crate::db::driver::{Capabilities, DbDriver};
use crate::db::drivers::sqlite::{dml, introspect};
use crate::db::shared::{build_where_clause, marshal, FilterDialect, QueryResult};
use crate::db::types::{
    ColumnInfo, ColumnSpec, CompletionColumn, CompletionForeignKey, CompletionFunction,
    CompletionResponse, CompletionTable, ConstraintInfo, DatabaseInfo, IndexInfo, SchemaTree,
    TableDataOptions, TableDetailResponse,
};
use crate::error::AppError;
use crate::store::connections::ConnectionSecret;

pub struct SqliteDriver {
    pub pool: SqlitePool,
    pub database: String,
}

impl SqliteDriver {
    pub async fn connect(secret: &ConnectionSecret) -> Result<Self, AppError> {
        let raw_path = secret.connection.database.trim();
        let db_path = if raw_path.is_empty() {
            ":memory:"
        } else {
            raw_path.strip_prefix("sqlite://").unwrap_or(raw_path)
        };

        let mut opts = if db_path == ":memory:" {
            SqliteConnectOptions::new().in_memory(true)
        } else {
            SqliteConnectOptions::new()
                .filename(db_path)
                .create_if_missing(true)
        };

        if secret.connection.readonly {
            opts = opts.read_only(true);
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .idle_timeout(std::time::Duration::from_secs(30))
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect_with(opts)
            .await
            .map_err(|e| AppError::Database(format!("Failed to open SQLite database: {}", e)))?;

        Ok(Self {
            pool,
            database: db_path.to_string(),
        })
    }

    pub fn new(pool: SqlitePool, database: String) -> Self {
        Self { pool, database }
    }
}

#[async_trait::async_trait]
impl DbDriver for SqliteDriver {
    fn id(&self) -> &'static str {
        "sqlite"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            kind: "relational".to_string(),
            has_databases: false,
            has_schemas: false,
            has_functions: false,
            supports_database_switch: false,
            supports_returning: true,
            connection_shape: "file".to_string(),
        }
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError> {
        introspect::list_databases(&self.pool, &self.database).await
    }

    async fn list_schemas(&self) -> Result<Vec<String>, AppError> {
        introspect::list_schemas(&self.pool).await
    }

    async fn get_tree(&self, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError> {
        introspect::get_tree(&self.pool, search).await
    }

    async fn get_columns(
        &self,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, AppError> {
        introspect::get_columns(&self.pool, table).await
    }

    async fn get_indexes(
        &self,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<IndexInfo>, AppError> {
        introspect::get_indexes(&self.pool, table).await
    }

    async fn get_constraints(
        &self,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ConstraintInfo>, AppError> {
        introspect::get_constraints(&self.pool, table).await
    }

    async fn get_table_foreign_keys(
        &self,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<CompletionForeignKey>, AppError> {
        introspect::get_table_foreign_keys(&self.pool, table).await
    }

    async fn get_table_detail(
        &self,
        _schema: Option<&str>,
        table: &str,
    ) -> Result<TableDetailResponse, AppError> {
        let (columns_res, indexes_res, constraints_res, fks_res) = tokio::join!(
            introspect::get_columns(&self.pool, table),
            introspect::get_indexes(&self.pool, table),
            introspect::get_constraints(&self.pool, table),
            introspect::get_table_foreign_keys(&self.pool, table),
        );

        let columns = columns_res?;
        let indexes = indexes_res?;
        let constraints = constraints_res?;
        let foreign_keys = fks_res.unwrap_or_default();

        let primary_key = columns
            .iter()
            .filter(|c| c.is_primary_key)
            .map(|c| c.name.clone())
            .collect();

        Ok(TableDetailResponse {
            columns,
            indexes,
            constraints,
            primary_key,
            foreign_keys,
        })
    }

    async fn get_all_columns(&self) -> Result<Vec<CompletionColumn>, AppError> {
        introspect::get_all_columns(&self.pool).await
    }

    async fn get_functions(&self) -> Result<Vec<CompletionFunction>, AppError> {
        Ok(introspect::get_functions())
    }

    async fn get_foreign_keys(&self) -> Result<Vec<CompletionForeignKey>, AppError> {
        introspect::get_foreign_keys(&self.pool).await
    }

    async fn get_completion(&self) -> Result<CompletionResponse, AppError> {
        let (tree_res, cols_res, fks_res) = tokio::join!(
            introspect::get_tree(&self.pool, None),
            introspect::get_all_columns(&self.pool),
            introspect::get_foreign_keys(&self.pool),
        );

        let tree = tree_res?;
        let columns = cols_res?;
        let functions = introspect::get_functions();
        let foreign_keys = fks_res.unwrap_or_default();

        let tables = tree
            .into_iter()
            .flat_map(|s| {
                let sch = s.schema.clone();
                s.relations.into_iter().map(move |r| CompletionTable {
                    schema: sch.clone(),
                    name: r.name,
                    r#type: r.r#type,
                })
            })
            .collect();

        Ok(CompletionResponse {
            tables,
            columns,
            functions,
            foreign_keys,
        })
    }

    async fn get_table_data(
        &self,
        schema: Option<&str>,
        table: &str,
        opts: TableDataOptions,
    ) -> Result<QueryResult, AppError> {
        let target = dml::rel(schema, table);
        let mut sql = format!("SELECT * FROM {}", target);
        let mut params = Vec::new();

        if let Some(where_clause) = build_where_clause(
            FilterDialect::Sqlite,
            opts.filter_column.as_deref(),
            opts.filter_value.as_deref(),
            opts.filter_group.as_ref(),
            &mut params,
        ) {
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        if let Some(order_by) = &opts.order_by {
            let dir = if opts.order_dir.as_deref() == Some("DESC") {
                "DESC"
            } else {
                "ASC"
            };
            sql.push_str(&format!(" ORDER BY {} {}", dml::quote_ident(order_by), dir));
        }

        sql.push_str(" LIMIT ? OFFSET ?");
        params.push(serde_json::Value::Number((opts.limit as u64).into()));
        params.push(serde_json::Value::Number((opts.offset as u64).into()));

        self.exec_query(&sql, &params).await
    }

    async fn exec_query(
        &self,
        sql: &str,
        params: &[serde_json::Value],
    ) -> Result<QueryResult, AppError> {
        let trimmed = sql.trim_start();
        let cmd = marshal::detect_command(trimmed).unwrap_or_default();
        let is_returning = sql.to_uppercase().contains("RETURNING");

        if is_returning || matches!(cmd.as_str(), "SELECT" | "PRAGMA" | "WITH" | "EXPLAIN") {
            let mut query = sqlx::query(sql);
            for p in params {
                match p {
                    serde_json::Value::Null => query = query.bind(None::<String>),
                    serde_json::Value::Bool(b) => query = query.bind(*b),
                    serde_json::Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            query = query.bind(i);
                        } else if let Some(f) = n.as_f64() {
                            query = query.bind(f);
                        } else {
                            query = query.bind(n.to_string());
                        }
                    }
                    serde_json::Value::String(s) => query = query.bind(s.clone()),
                    other => query = query.bind(other.to_string()),
                }
            }
            let rows = query
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            Ok(marshal::marshal_sqlite_rows(&rows, sql))
        } else {
            let mut query = sqlx::query(sql);
            for p in params {
                match p {
                    serde_json::Value::Null => query = query.bind(None::<String>),
                    serde_json::Value::Bool(b) => query = query.bind(*b),
                    serde_json::Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            query = query.bind(i);
                        } else if let Some(f) = n.as_f64() {
                            query = query.bind(f);
                        } else {
                            query = query.bind(n.to_string());
                        }
                    }
                    serde_json::Value::String(s) => query = query.bind(s.clone()),
                    other => query = query.bind(other.to_string()),
                }
            }
            let res = query
                .execute(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            Ok(QueryResult {
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: res.rows_affected() as usize,
                command: Some(cmd),
            })
        }
    }

    async fn insert_row(
        &self,
        schema: Option<&str>,
        table: &str,
        values: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let (sql, params) = dml::build_insert(schema, table, values);
        let inlined = dml::inline_params(&sql, &params);
        let result = self.exec_query(&sql, &params).await?;
        Ok((result, inlined))
    }

    async fn update_row(
        &self,
        schema: Option<&str>,
        table: &str,
        pk: &serde_json::Map<String, serde_json::Value>,
        values: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let (sql, params) = dml::build_update(schema, table, pk, values)?;
        let inlined = dml::inline_params(&sql, &params);
        let result = self.exec_query(&sql, &params).await?;
        Ok((result, inlined))
    }

    async fn delete_row(
        &self,
        schema: Option<&str>,
        table: &str,
        pk: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let (sql, params) = dml::build_delete(schema, table, pk)?;
        let inlined = dml::inline_params(&sql, &params);
        let result = self.exec_query(&sql, &params).await?;
        Ok((result, inlined))
    }

    async fn create_table(
        &self,
        schema: Option<&str>,
        table: &str,
        columns: &[ColumnSpec],
    ) -> Result<String, AppError> {
        let sql = dml::build_create_table(schema, table, columns)?;
        self.exec_query(&sql, &[]).await?;
        Ok(sql)
    }

    async fn drop_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError> {
        let target = dml::rel(schema, table);
        let ddl = format!("DROP TABLE {}", target);
        self.exec_query(&ddl, &[]).await?;
        Ok(ddl)
    }

    async fn truncate_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError> {
        let target = dml::rel(schema, table);
        let ddl = format!("DELETE FROM {}", target);
        self.exec_query(&ddl, &[]).await?;
        Ok(ddl)
    }

    async fn create_database(&self, _name: &str) -> Result<(), AppError> {
        Err(AppError::BadRequest(
            "SQLite databases are file-based. Create a new database file to create a database.".to_string(),
        ))
    }

    async fn drop_database(&self, _name: &str) -> Result<(), AppError> {
        Err(AppError::BadRequest(
            "SQLite databases are file-based. Delete the database file to remove it.".to_string(),
        ))
    }

    fn quote_ident(&self, name: &str) -> String {
        dml::quote_ident(name)
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}

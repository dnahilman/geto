use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions, MySqlSslMode};
use sqlx::MySqlPool;

use crate::db::driver::{Capabilities, DbDriver};
use crate::db::drivers::mysql::{dml, introspect};
use crate::db::shared::{marshal, QueryResult};
use crate::db::types::{
    ColumnInfo, ColumnSpec, CompletionColumn, CompletionForeignKey, CompletionFunction,
    CompletionResponse, CompletionTable, ConstraintInfo, DatabaseInfo, IndexInfo, SchemaTree,
    TableDataOptions, TableDetailResponse,
};
use crate::error::AppError;
use crate::store::connections::{ConnectionSecret, SslMode};

pub struct MySqlDriver {
    pool: MySqlPool,
    database: String,
}

impl MySqlDriver {
    pub async fn connect(secret: &ConnectionSecret) -> Result<Self, AppError> {
        let ssl = match secret.connection.ssl_mode {
            SslMode::Disable => MySqlSslMode::Disabled,
            SslMode::Require => MySqlSslMode::Required,
            _ => MySqlSslMode::Preferred,
        };

        let mut opts = MySqlConnectOptions::new()
            .host(&secret.connection.host)
            .port(secret.connection.port as u16)
            .username(&secret.connection.username)
            .ssl_mode(ssl);

        if let Some(pwd) = &secret.password {
            opts = opts.password(pwd);
        }
        if !secret.connection.database.is_empty() {
            opts = opts.database(&secret.connection.database);
        }

        let pool = MySqlPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect_with(opts)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(Self {
            pool,
            database: secret.connection.database.clone(),
        })
    }

    pub fn new(pool: MySqlPool, database: String) -> Self {
        Self { pool, database }
    }
}

#[async_trait::async_trait]
impl DbDriver for MySqlDriver {
    fn id(&self) -> &'static str {
        "mysql"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            kind: "relational".to_string(),
            has_databases: true,
            has_schemas: true,
            has_functions: true,
            supports_database_switch: true,
            supports_returning: false,
            connection_shape: "network".to_string(),
        }
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError> {
        introspect::list_databases(&self.pool).await
    }

    async fn list_schemas(&self) -> Result<Vec<String>, AppError> {
        introspect::list_schemas(&self.pool, Some(&self.database)).await
    }

    async fn get_tree(&self, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError> {
        introspect::get_tree(&self.pool, Some(&self.database), search).await
    }

    async fn get_columns(&self, schema: Option<&str>, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
        let sch = schema.unwrap_or(&self.database);
        introspect::get_columns(&self.pool, Some(sch), table).await
    }

    async fn get_indexes(&self, schema: Option<&str>, table: &str) -> Result<Vec<IndexInfo>, AppError> {
        let sch = schema.unwrap_or(&self.database);
        introspect::get_indexes(&self.pool, Some(sch), table).await
    }

    async fn get_constraints(&self, schema: Option<&str>, table: &str) -> Result<Vec<ConstraintInfo>, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (constraints, _) = introspect::get_constraints_and_fks(&self.pool, sch, table).await?;
        Ok(constraints)
    }

    async fn get_table_foreign_keys(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<CompletionForeignKey>, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (_, foreign_keys) = introspect::get_constraints_and_fks(&self.pool, sch, table).await?;
        Ok(foreign_keys)
    }

    async fn get_table_detail(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDetailResponse, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (cols_res, idx_res, cfk_res) = tokio::join!(
            introspect::get_columns(&self.pool, Some(sch), table),
            introspect::get_indexes(&self.pool, Some(sch), table),
            introspect::get_constraints_and_fks(&self.pool, sch, table),
        );

        let columns = cols_res?;
        let indexes = idx_res?;
        let (constraints, foreign_keys) = cfk_res.unwrap_or_default();

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
        introspect::get_all_columns(&self.pool, Some(&self.database)).await
    }

    async fn get_functions(&self) -> Result<Vec<CompletionFunction>, AppError> {
        introspect::get_functions(&self.pool, Some(&self.database)).await
    }

    async fn get_foreign_keys(&self) -> Result<Vec<CompletionForeignKey>, AppError> {
        introspect::get_foreign_keys(&self.pool, Some(&self.database)).await
    }

    async fn get_completion(&self) -> Result<CompletionResponse, AppError> {
        let (tree_res, cols_res, funcs_res, fks_res) = tokio::join!(
            introspect::get_tree(&self.pool, Some(&self.database), None),
            introspect::get_all_columns(&self.pool, Some(&self.database)),
            introspect::get_functions(&self.pool, Some(&self.database)),
            introspect::get_foreign_keys(&self.pool, Some(&self.database)),
        );

        let tree = tree_res?;
        let columns = cols_res?;
        let functions = funcs_res.unwrap_or_default();
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
        let sch = schema.unwrap_or(&self.database);
        let target = if !sch.is_empty() {
            format!("{}.{}", dml::quote_ident(sch), dml::quote_ident(table))
        } else {
            dml::quote_ident(table)
        };

        let mut sql = format!("SELECT * FROM {}", target);
        let mut params = Vec::new();

        if let (Some(col), Some(val)) = (&opts.filter_column, &opts.filter_value) {
            sql.push_str(&format!(" WHERE {} = ?", dml::quote_ident(col)));
            params.push(serde_json::Value::String(val.clone()));
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

        match cmd.as_str() {
            "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "DROP" | "ALTER" | "TRUNCATE" | "SET" => {
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
            _ => {
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
                Ok(marshal::marshal_mysql_rows(&rows, sql))
            }
        }
    }

    async fn insert_row(
        &self,
        schema: Option<&str>,
        table: &str,
        values: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (text, params) = dml::build_insert(Some(sch), table, values);
        let display = dml::inline_params(&text, &params);
        let res = self.exec_query(&text, &params).await?;
        Ok((res, display))
    }

    async fn update_row(
        &self,
        schema: Option<&str>,
        table: &str,
        pk: &serde_json::Map<String, serde_json::Value>,
        values: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (text, params) = dml::build_update(Some(sch), table, pk, values)?;
        let display = dml::inline_params(&text, &params);
        let res = self.exec_query(&text, &params).await?;
        Ok((res, display))
    }

    async fn delete_row(
        &self,
        schema: Option<&str>,
        table: &str,
        pk: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let sch = schema.unwrap_or(&self.database);
        let (text, params) = dml::build_delete(Some(sch), table, pk)?;
        let display = dml::inline_params(&text, &params);
        let res = self.exec_query(&text, &params).await?;
        Ok((res, display))
    }

    async fn create_table(
        &self,
        schema: Option<&str>,
        table: &str,
        columns: &[ColumnSpec],
    ) -> Result<String, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let ddl = dml::build_create_table(Some(sch), table, columns)?;
        self.exec_query(&ddl, &[]).await?;
        Ok(ddl)
    }

    async fn drop_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let ddl = format!("DROP TABLE {}.{}", dml::quote_ident(sch), dml::quote_ident(table));
        self.exec_query(&ddl, &[]).await?;
        Ok(ddl)
    }

    async fn truncate_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError> {
        let sch = schema.unwrap_or(&self.database);
        let ddl = format!("TRUNCATE {}.{}", dml::quote_ident(sch), dml::quote_ident(table));
        self.exec_query(&ddl, &[]).await?;
        Ok(ddl)
    }

    async fn create_database(&self, name: &str) -> Result<(), AppError> {
        let ddl = format!("CREATE DATABASE {}", dml::quote_ident(name));
        self.exec_query(&ddl, &[]).await?;
        Ok(())
    }

    async fn drop_database(&self, name: &str) -> Result<(), AppError> {
        let ddl = format!("DROP DATABASE {}", dml::quote_ident(name));
        self.exec_query(&ddl, &[]).await?;
        Ok(())
    }

    fn quote_ident(&self, name: &str) -> String {
        dml::quote_ident(name)
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}

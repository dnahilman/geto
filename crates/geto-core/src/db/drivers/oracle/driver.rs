use std::sync::Arc;

use crate::db::driver::{Capabilities, DbDriver};
use crate::db::drivers::oracle::{dml, introspect};
use crate::db::shared::{build_where_clause, marshal, FilterDialect, QueryResult};
use crate::db::types::{
    ColumnInfo, ColumnSpec, CompletionColumn, CompletionForeignKey, CompletionFunction,
    CompletionResponse, ConstraintInfo, DatabaseInfo, IndexInfo, SchemaTree, TableDataOptions,
    TableDetailResponse,
};
use crate::error::AppError;
use crate::store::connections::ConnectionSecret;

pub struct OracleDriver {
    pub conn: Arc<oracle_rs::Connection>,
    pub database: String,
}

fn json_to_oracle_value(val: &serde_json::Value) -> oracle_rs::Value {
    match val {
        serde_json::Value::Null => oracle_rs::Value::Null,
        serde_json::Value::Bool(b) => oracle_rs::Value::Boolean(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                oracle_rs::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                oracle_rs::Value::Float(f)
            } else {
                oracle_rs::Value::Number(oracle_rs::types::OracleNumber::new(n.to_string()))
            }
        }
        serde_json::Value::String(s) => oracle_rs::Value::String(s.clone()),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            oracle_rs::Value::String(serde_json::to_string(val).unwrap_or_default())
        }
    }
}

fn is_select_like(sql: &str) -> bool {
    let trimmed = sql.trim_start();
    let word: String = trimmed.chars().take_while(|c| c.is_alphabetic()).collect();
    matches!(
        word.to_uppercase().as_str(),
        "SELECT" | "WITH" | "EXPLAIN" | "SHOW" | "DESCRIBE" | "DESC"
    )
}

impl OracleDriver {
    pub async fn connect(secret: &ConnectionSecret) -> Result<Self, AppError> {
        let host = secret.connection.host.trim();
        let port = if secret.connection.port > 0 {
            secret.connection.port as u16
        } else {
            1521
        };
        let database = if secret.connection.database.trim().is_empty() {
            "FREEPDB1"
        } else {
            secret.connection.database.trim()
        };
        let username = secret.connection.username.trim();
        let password = secret.password.as_deref().unwrap_or_default();

        let mut config = oracle_rs::Config::new(host, port, database, username, password);

        if secret.connection.ssl_mode == crate::store::connections::SslMode::Require
            || secret.connection.ssl_mode == crate::store::connections::SslMode::Prefer
        {
            if let Ok(cfg_tls) = config.clone().with_tls() {
                config = cfg_tls;
            }
        }

        let conn = oracle_rs::Connection::connect_with_config(config)
            .await
            .map_err(|e| AppError::Database(format!("Failed to connect to Oracle database: {}", e)))?;

        Ok(Self {
            conn: Arc::new(conn),
            database: database.to_string(),
        })
    }

    pub fn new(conn: oracle_rs::Connection, database: String) -> Self {
        Self {
            conn: Arc::new(conn),
            database,
        }
    }
}

#[async_trait::async_trait]
impl DbDriver for OracleDriver {
    fn id(&self) -> &'static str {
        "oracle"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            kind: "relational".to_string(),
            has_databases: false,
            has_schemas: true,
            has_functions: true,
            supports_database_switch: false,
            supports_returning: false,
            connection_shape: "network".to_string(),
        }
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError> {
        introspect::list_databases(&self.conn, &self.database).await
    }

    async fn list_schemas(&self) -> Result<Vec<String>, AppError> {
        introspect::list_schemas(&self.conn).await
    }

    async fn get_tree(&self, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError> {
        introspect::get_tree(&self.conn, search).await
    }

    async fn get_columns(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, AppError> {
        introspect::get_columns(&self.conn, schema, table).await
    }

    async fn get_indexes(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<IndexInfo>, AppError> {
        introspect::get_indexes(&self.conn, schema, table).await
    }

    async fn get_constraints(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ConstraintInfo>, AppError> {
        introspect::get_constraints(&self.conn, schema, table).await
    }

    async fn get_table_foreign_keys(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<CompletionForeignKey>, AppError> {
        introspect::get_table_foreign_keys(&self.conn, schema, table).await
    }

    async fn get_table_detail(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDetailResponse, AppError> {
        introspect::get_table_detail(&self.conn, schema, table).await
    }

    async fn get_all_columns(&self) -> Result<Vec<CompletionColumn>, AppError> {
        introspect::get_all_columns(&self.conn).await
    }

    async fn get_functions(&self) -> Result<Vec<CompletionFunction>, AppError> {
        introspect::get_functions(&self.conn).await
    }

    async fn get_foreign_keys(&self) -> Result<Vec<CompletionForeignKey>, AppError> {
        introspect::get_foreign_keys(&self.conn).await
    }

    async fn get_completion(&self) -> Result<CompletionResponse, AppError> {
        introspect::get_completion(&self.conn).await
    }

    async fn get_table_data(
        &self,
        schema: Option<&str>,
        table: &str,
        opts: TableDataOptions,
    ) -> Result<QueryResult, AppError> {
        let rel_name = dml::rel(schema, table);
        let mut params = Vec::new();
        let where_clause = build_where_clause(
            FilterDialect::Oracle,
            opts.filter_column.as_deref(),
            opts.filter_value.as_deref(),
            opts.filter_group.as_ref(),
            &mut params,
        );

        let mut sql = format!("SELECT * FROM {}", rel_name);
        if let Some(w) = where_clause {
            sql.push_str(" WHERE ");
            sql.push_str(&w);
        }

        if let Some(ref order_by) = opts.order_by {
            if !order_by.trim().is_empty() {
                let dir = if opts.order_dir.as_deref() == Some("DESC") {
                    "DESC"
                } else {
                    "ASC"
                };
                sql.push_str(&format!(" ORDER BY {} {}", dml::quote_ident(order_by), dir));
            }
        }

        let limit = opts.limit.max(1);
        let offset = opts.offset;
        sql.push_str(&format!(
            " OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",
            offset, limit
        ));

        self.exec_query(&sql, &params).await
    }

    async fn exec_query(
        &self,
        sql: &str,
        params: &[serde_json::Value],
    ) -> Result<QueryResult, AppError> {
        let oracle_params: Vec<oracle_rs::Value> =
            params.iter().map(json_to_oracle_value).collect();
        let trimmed = sql.trim();

        if is_select_like(trimmed) {
            let qr = self
                .conn
                .query(sql, &oracle_params)
                .await
                .map_err(|e| AppError::Database(format!("Oracle query error: {}", e)))?;
            Ok(marshal::marshal_oracle_rows(qr, sql))
        } else {
            let qr = self
                .conn
                .execute(sql, &oracle_params)
                .await
                .map_err(|e| AppError::Database(format!("Oracle execute error: {}", e)))?;
            let _ = self.conn.commit().await;
            Ok(marshal::marshal_oracle_rows(qr, sql))
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
        let qr = self.exec_query(&sql, &params).await?;
        Ok((qr, inlined))
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
        let qr = self.exec_query(&sql, &params).await?;
        Ok((qr, inlined))
    }

    async fn delete_row(
        &self,
        schema: Option<&str>,
        table: &str,
        pk: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(QueryResult, String), AppError> {
        let (sql, params) = dml::build_delete(schema, table, pk)?;
        let inlined = dml::inline_params(&sql, &params);
        let qr = self.exec_query(&sql, &params).await?;
        Ok((qr, inlined))
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
        let sql = format!("DROP TABLE {} CASCADE CONSTRAINTS", dml::rel(schema, table));
        self.exec_query(&sql, &[]).await?;
        Ok(sql)
    }

    async fn truncate_table(&self, schema: Option<&str>, table: &str) -> Result<String, AppError> {
        let sql = format!("TRUNCATE TABLE {}", dml::rel(schema, table));
        self.exec_query(&sql, &[]).await?;
        Ok(sql)
    }

    async fn create_database(&self, _name: &str) -> Result<(), AppError> {
        Err(AppError::BadRequest(
            "Creating databases dynamically is not supported on Oracle via user connections".to_string(),
        ))
    }

    async fn drop_database(&self, _name: &str) -> Result<(), AppError> {
        Err(AppError::BadRequest(
            "Dropping databases dynamically is not supported on Oracle via user connections".to_string(),
        ))
    }

    fn quote_ident(&self, name: &str) -> String {
        dml::quote_ident(name)
    }

    async fn close(&self) {
        let _ = self.conn.close().await;
    }
}

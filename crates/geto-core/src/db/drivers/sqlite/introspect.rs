use sqlx::{Row, SqlitePool};

use crate::db::drivers::sqlite::dml::quote_ident;
use crate::db::types::{
    ColumnInfo, CompletionColumn, CompletionForeignKey, CompletionFunction, ConstraintInfo,
    DatabaseInfo, IndexInfo, RelationEntry, RelationType, SchemaTree,
};
use crate::error::AppError;

fn format_bytes(bytes: f64) -> String {
    if bytes <= 0.0 {
        return "0 B".to_string();
    }
    let k: f64 = 1024.0;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (bytes.ln() / k.ln()).floor() as usize;
    let idx = i.min(sizes.len() - 1);
    let val = bytes / k.powi(idx as i32);
    format!("{:.1} {}", val, sizes[idx])
}

pub async fn list_databases(
    pool: &SqlitePool,
    default_name: &str,
) -> Result<Vec<DatabaseInfo>, AppError> {
    let rows = sqlx::query("PRAGMA database_list")
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
        .fetch_one(pool)
        .await
        .unwrap_or(4096);

    let total_bytes = (page_count * page_size) as f64;
    let formatted_size = format_bytes(total_bytes);

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let name: String = row.try_get("name").unwrap_or_else(|_| default_name.to_string());
        out.push(DatabaseInfo {
            name,
            owner: "sqlite".to_string(),
            size: formatted_size.clone(),
        });
    }

    if out.is_empty() {
        out.push(DatabaseInfo {
            name: if default_name.is_empty() {
                "main".to_string()
            } else {
                default_name.to_string()
            },
            owner: "sqlite".to_string(),
            size: formatted_size,
        });
    }

    Ok(out)
}

pub async fn list_schemas(pool: &SqlitePool) -> Result<Vec<String>, AppError> {
    let rows = sqlx::query("PRAGMA database_list")
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut schemas = Vec::new();
    for row in rows {
        if let Ok(name) = row.try_get::<String, _>("name") {
            schemas.push(name);
        }
    }

    if schemas.is_empty() {
        schemas.push("main".to_string());
    }

    Ok(schemas)
}

pub async fn get_tree(pool: &SqlitePool, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError> {
    let sql = if search.is_some() {
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name LIKE ? ORDER BY name"
    } else {
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    };

    let mut query = sqlx::query(sql);
    if let Some(s) = search {
        query = query.bind(format!("%{}%", s.trim()));
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut relations = Vec::with_capacity(rows.len());
    for row in rows {
        let name: String = row.try_get("name").unwrap_or_default();
        let kind: String = row.try_get("type").unwrap_or_default();
        let r#type = if kind == "view" {
            RelationType::View
        } else {
            RelationType::Table
        };
        relations.push(RelationEntry { name, r#type });
    }

    Ok(vec![SchemaTree {
        schema: "main".to_string(),
        relations,
    }])
}

pub async fn get_columns(pool: &SqlitePool, table: &str) -> Result<Vec<ColumnInfo>, AppError> {
    let pragma_sql = format!("PRAGMA table_info({})", quote_ident(table));
    let rows = sqlx::query(&pragma_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut cols = Vec::with_capacity(rows.len());
    for row in rows {
        let cid: i64 = row.try_get("cid").unwrap_or(0);
        let name: String = row.try_get("name").unwrap_or_default();
        let r#type: String = row.try_get("type").unwrap_or_default();
        let notnull: i64 = row.try_get("notnull").unwrap_or(0);
        let dflt_value: Option<String> = row.try_get("dflt_value").ok();
        let pk: i64 = row.try_get("pk").unwrap_or(0);

        cols.push(ColumnInfo {
            name,
            r#type: if r#type.is_empty() {
                "TEXT".to_string()
            } else {
                r#type
            },
            not_null: notnull != 0,
            default: dflt_value,
            ordinal: cid as i32 + 1,
            is_primary_key: pk > 0,
            enum_values: None,
        });
    }

    Ok(cols)
}

pub async fn get_indexes(pool: &SqlitePool, table: &str) -> Result<Vec<IndexInfo>, AppError> {
    let pragma_sql = format!("PRAGMA index_list({})", quote_ident(table));
    let rows = sqlx::query(&pragma_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut indexes = Vec::with_capacity(rows.len());
    for row in rows {
        let idx_name: String = row.try_get("name").unwrap_or_default();
        let unique: i64 = row.try_get("unique").unwrap_or(0);
        let origin: String = row.try_get("origin").unwrap_or_default();

        let info_sql = format!("PRAGMA index_info({})", quote_ident(&idx_name));
        let col_rows = sqlx::query(&info_sql)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

        let mut columns = Vec::new();
        for cr in col_rows {
            if let Ok(cname) = cr.try_get::<String, _>("name") {
                columns.push(cname);
            }
        }

        let def_row: Option<String> = sqlx::query_scalar(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .bind(&idx_name)
        .fetch_optional(pool)
        .await
        .unwrap_or_default();

        let definition = def_row.unwrap_or_else(|| {
            format!(
                "CREATE {}INDEX {} ON {} ({})",
                if unique == 1 { "UNIQUE " } else { "" },
                quote_ident(&idx_name),
                quote_ident(table),
                columns.iter().map(|c| quote_ident(c)).collect::<Vec<_>>().join(", ")
            )
        });

        indexes.push(IndexInfo {
            name: idx_name,
            definition,
            is_unique: unique == 1,
            is_primary: origin == "pk",
        });
    }

    Ok(indexes)
}

pub async fn get_constraints(pool: &SqlitePool, table: &str) -> Result<Vec<ConstraintInfo>, AppError> {
    let mut constraints = Vec::new();

    // 1. Primary Key from table_info
    let cols = get_columns(pool, table).await?;
    let pk_cols: Vec<String> = cols
        .iter()
        .filter(|c| c.is_primary_key)
        .map(|c| quote_ident(&c.name))
        .collect();

    if !pk_cols.is_empty() {
        constraints.push(ConstraintInfo {
            name: format!("{}_pk", table),
            r#type: "PRIMARY KEY".to_string(),
            definition: format!("PRIMARY KEY ({})", pk_cols.join(", ")),
        });
    }

    // 2. Foreign Keys from pragma foreign_key_list
    let fk_sql = format!("PRAGMA foreign_key_list({})", quote_ident(table));
    if let Ok(fk_rows) = sqlx::query(&fk_sql).fetch_all(pool).await {
        for row in fk_rows {
            let id: i64 = row.try_get("id").unwrap_or(0);
            let to_table: String = row.try_get("table").unwrap_or_default();
            let from_col: String = row.try_get("from").unwrap_or_default();
            let to_col: String = row.try_get("to").unwrap_or_default();
            let on_update: String = row.try_get("on_update").unwrap_or_default();
            let on_delete: String = row.try_get("on_delete").unwrap_or_default();

            let def = format!(
                "FOREIGN KEY ({}) REFERENCES {}({}) ON UPDATE {} ON DELETE {}",
                quote_ident(&from_col),
                quote_ident(&to_table),
                quote_ident(&to_col),
                on_update,
                on_delete
            );

            constraints.push(ConstraintInfo {
                name: format!("{}_{}_fk", table, id),
                r#type: "FOREIGN KEY".to_string(),
                definition: def,
            });
        }
    }

    // 3. Unique constraints from index_list
    let idx_sql = format!("PRAGMA index_list({})", quote_ident(table));
    if let Ok(idx_rows) = sqlx::query(&idx_sql).fetch_all(pool).await {
        for row in idx_rows {
            let unique: i64 = row.try_get("unique").unwrap_or(0);
            let origin: String = row.try_get("origin").unwrap_or_default();
            let name: String = row.try_get("name").unwrap_or_default();

            if unique == 1 && origin == "u" {
                let info_sql = format!("PRAGMA index_info({})", quote_ident(&name));
                let col_rows = sqlx::query(&info_sql).fetch_all(pool).await.unwrap_or_default();
                let cols_joined = col_rows
                    .into_iter()
                    .filter_map(|cr| cr.try_get::<String, _>("name").ok())
                    .map(|c| quote_ident(&c))
                    .collect::<Vec<_>>()
                    .join(", ");

                constraints.push(ConstraintInfo {
                    name,
                    r#type: "UNIQUE".to_string(),
                    definition: format!("UNIQUE ({})", cols_joined),
                });
            }
        }
    }

    Ok(constraints)
}

pub async fn get_table_foreign_keys(
    pool: &SqlitePool,
    table: &str,
) -> Result<Vec<CompletionForeignKey>, AppError> {
    let fk_sql = format!("PRAGMA foreign_key_list({})", quote_ident(table));
    let rows = sqlx::query(&fk_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut fks = Vec::with_capacity(rows.len());
    for row in rows {
        let to_table: String = row.try_get("table").unwrap_or_default();
        let from_col: String = row.try_get("from").unwrap_or_default();
        let to_col: String = row.try_get("to").unwrap_or_default();

        fks.push(CompletionForeignKey {
            schema: "main".to_string(),
            table: table.to_string(),
            columns: vec![from_col],
            ref_schema: "main".to_string(),
            ref_table: to_table,
            ref_columns: vec![to_col],
        });
    }

    Ok(fks)
}

pub async fn get_all_columns(pool: &SqlitePool) -> Result<Vec<CompletionColumn>, AppError> {
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    let mut all_cols = Vec::new();
    for tbl in tables {
        let pragma_sql = format!("PRAGMA table_info({})", quote_ident(&tbl));
        if let Ok(rows) = sqlx::query(&pragma_sql).fetch_all(pool).await {
            for row in rows {
                let col_name: String = row.try_get("name").unwrap_or_default();
                let col_type: String = row.try_get("type").unwrap_or_default();
                all_cols.push(CompletionColumn {
                    schema: "main".to_string(),
                    table: tbl.clone(),
                    name: col_name,
                    r#type: if col_type.is_empty() {
                        "TEXT".to_string()
                    } else {
                        col_type
                    },
                });
            }
        }
    }

    Ok(all_cols)
}

pub fn get_functions() -> Vec<CompletionFunction> {
    let funcs = [
        ("abs", "X", "number", "function"),
        ("avg", "X", "number", "aggregate"),
        ("changes", "", "integer", "function"),
        ("char", "X1, X2, ...", "text", "function"),
        ("coalesce", "X, Y, ...", "any", "function"),
        ("count", "X", "integer", "aggregate"),
        ("date", "timestring, modifier, ...", "text", "function"),
        ("datetime", "timestring, modifier, ...", "text", "function"),
        ("glob", "X, Y", "integer", "function"),
        ("group_concat", "X, [Y]", "text", "aggregate"),
        ("hex", "X", "text", "function"),
        ("iif", "X, Y, Z", "any", "function"),
        ("instr", "X, Y", "integer", "function"),
        ("julianday", "timestring, modifier, ...", "real", "function"),
        ("json", "X", "text", "function"),
        ("json_array", "...", "text", "function"),
        ("json_extract", "X, path, ...", "any", "function"),
        ("json_object", "...", "text", "function"),
        ("last_insert_rowid", "", "integer", "function"),
        ("length", "X", "integer", "function"),
        ("like", "X, Y, [Z]", "integer", "function"),
        ("lower", "X", "text", "function"),
        ("ltrim", "X, [Y]", "text", "function"),
        ("max", "X, Y, ...", "any", "aggregate"),
        ("min", "X, Y, ...", "any", "aggregate"),
        ("nullif", "X, Y", "any", "function"),
        ("printf", "format, ...", "text", "function"),
        ("quote", "X", "text", "function"),
        ("random", "", "integer", "function"),
        ("round", "X, [Y]", "real", "function"),
        ("rtrim", "X, [Y]", "text", "function"),
        ("strftime", "format, timestring, ...", "text", "function"),
        ("substr", "X, Y, [Z]", "text", "function"),
        ("sum", "X", "number", "aggregate"),
        ("time", "timestring, modifier, ...", "text", "function"),
        ("total", "X", "real", "aggregate"),
        ("trim", "X, [Y]", "text", "function"),
        ("typeof", "X", "text", "function"),
        ("upper", "X", "text", "function"),
    ];

    funcs
        .into_iter()
        .map(|(name, args, returns, kind)| CompletionFunction {
            schema: "main".to_string(),
            name: name.to_string(),
            args: args.to_string(),
            returns: returns.to_string(),
            kind: kind.to_string(),
        })
        .collect()
}

pub async fn get_foreign_keys(pool: &SqlitePool) -> Result<Vec<CompletionForeignKey>, AppError> {
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    let mut all_fks = Vec::new();
    for tbl in tables {
        let fks = get_table_foreign_keys(pool, &tbl).await.unwrap_or_default();
        all_fks.extend(fks);
    }

    Ok(all_fks)
}

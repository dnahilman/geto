use indexmap::IndexMap;
use regex::Regex;
use sqlx::mysql::MySqlRow;
use sqlx::{MySqlPool, Row};

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

pub fn get_str_or_blob(r: &MySqlRow, col: &str) -> Result<String, sqlx::Error> {
    if let Ok(s) = r.try_get::<String, _>(col) {
        Ok(s)
    } else if let Ok(b) = r.try_get::<Vec<u8>, _>(col) {
        Ok(String::from_utf8_lossy(&b).to_string())
    } else {
        r.try_get::<String, _>(col)
    }
}

pub fn get_str_or_blob_idx(r: &MySqlRow, idx: usize) -> Result<String, sqlx::Error> {
    if let Ok(s) = r.try_get::<String, _>(idx) {
        Ok(s)
    } else if let Ok(b) = r.try_get::<Vec<u8>, _>(idx) {
        Ok(String::from_utf8_lossy(&b).to_string())
    } else {
        r.try_get::<String, _>(idx)
    }
}

pub fn get_opt_str_or_blob(r: &MySqlRow, col: &str) -> Option<String> {
    if let Ok(Some(s)) = r.try_get::<Option<String>, _>(col) {
        Some(s)
    } else if let Ok(Some(b)) = r.try_get::<Option<Vec<u8>>, _>(col) {
        Some(String::from_utf8_lossy(&b).to_string())
    } else {
        None
    }
}

pub fn parse_enum_values(col_type: &str) -> Option<Vec<String>> {
    let lower = col_type.to_lowercase();
    if lower.starts_with("enum(") && lower.ends_with(')') {
        let inner = &col_type[5..col_type.len() - 1];
        Some(
            inner
                .split(',')
                .map(|s| s.trim().trim_matches('\'').replace("''", "'"))
                .collect(),
        )
    } else {
        None
    }
}

pub fn parse_show_create_table(
    ddl: &str,
    current_schema: &str,
    current_table: &str,
) -> (Vec<ConstraintInfo>, Vec<CompletionForeignKey>) {
    let mut constraints = Vec::new();
    let mut foreign_keys = Vec::new();

    let re_pk = Regex::new(r"(?i)^PRIMARY\s+KEY\s*\(([^)]+)\)").unwrap();
    let re_fk = Regex::new(
        r"(?i)^CONSTRAINT\s+`([^`]+)`\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:`([^`]+)`\.)?`([^`]+)`\s*\(([^)]+)\)",
    )
    .unwrap();
    let re_uq = Regex::new(
        r"(?i)^(?:CONSTRAINT\s+`([^`]+)`\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?(?:\s+`([^`]+)`)?\s*\(([^)]+)\)",
    )
    .unwrap();
    let re_chk = Regex::new(r"(?i)^CONSTRAINT\s+`([^`]+)`\s+CHECK\s*\((.+)\)").unwrap();

    for raw_line in ddl.lines() {
        let line = raw_line.trim().trim_end_matches(',');

        if let Some(caps) = re_pk.captures(line) {
            let cols: Vec<String> = caps[1]
                .split(',')
                .map(|c| format!("`{}`", c.trim().trim_matches('`')))
                .collect();
            constraints.push(ConstraintInfo {
                name: "PRIMARY".to_string(),
                r#type: "PRIMARY KEY".to_string(),
                definition: format!("PRIMARY KEY ({})", cols.join(", ")),
            });
            continue;
        }

        if let Some(caps) = re_fk.captures(line) {
            let name = caps[1].to_string();
            let cols: Vec<String> = caps[2]
                .split(',')
                .map(|c| c.trim().trim_matches('`').to_string())
                .collect();
            let target_schema = caps.get(3).map_or(current_schema, |m| m.as_str());
            let ref_table = caps[4].to_string();
            let ref_cols: Vec<String> = caps[5]
                .split(',')
                .map(|c| c.trim().trim_matches('`').to_string())
                .collect();

            let def_cols = cols.iter().map(|c| format!("`{c}`")).collect::<Vec<_>>().join(", ");
            let def_ref_cols = ref_cols
                .iter()
                .map(|c| format!("`{c}`"))
                .collect::<Vec<_>>()
                .join(", ");
            let definition = format!(
                "FOREIGN KEY ({}) REFERENCES `{}`.`{}` ({})",
                def_cols, target_schema, ref_table, def_ref_cols
            );

            constraints.push(ConstraintInfo {
                name: name.clone(),
                r#type: "FOREIGN KEY".to_string(),
                definition,
            });

            foreign_keys.push(CompletionForeignKey {
                schema: current_schema.to_string(),
                table: current_table.to_string(),
                columns: cols,
                ref_schema: target_schema.to_string(),
                ref_table,
                ref_columns: ref_cols,
            });
            continue;
        }

        if let Some(caps) = re_uq.captures(line) {
            let name = caps
                .get(1)
                .or_else(|| caps.get(2))
                .map_or("UNIQUE", |m| m.as_str())
                .to_string();
            let cols: Vec<String> = caps[3]
                .split(',')
                .map(|c| format!("`{}`", c.trim().trim_matches('`')))
                .collect();
            constraints.push(ConstraintInfo {
                name,
                r#type: "UNIQUE".to_string(),
                definition: format!("UNIQUE ({})", cols.join(", ")),
            });
            continue;
        }

        if let Some(caps) = re_chk.captures(line) {
            let name = caps[1].to_string();
            let expr = caps[2].to_string();
            constraints.push(ConstraintInfo {
                name,
                r#type: "CHECK".to_string(),
                definition: format!("CHECK ({})", expr),
            });
            continue;
        }
    }

    (constraints, foreign_keys)
}

pub async fn list_databases(pool: &MySqlPool) -> Result<Vec<DatabaseInfo>, AppError> {
    let sql = r#"
        SELECT
            s.SCHEMA_NAME AS name,
            'root' AS owner,
            COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS size_bytes
        FROM information_schema.SCHEMATA s
        LEFT JOIN information_schema.TABLES t ON s.SCHEMA_NAME = t.TABLE_SCHEMA
        GROUP BY s.SCHEMA_NAME
        ORDER BY s.SCHEMA_NAME
    "#;

    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let owner = get_str_or_blob(&r, "owner").unwrap_or_else(|_| "root".to_string());
        let size_bytes: f64 = r
            .try_get::<i64, _>("size_bytes")
            .map(|v| v as f64)
            .or_else(|_| r.try_get::<f64, _>("size_bytes"))
            .or_else(|_| {
                get_str_or_blob(&r, "size_bytes")
                    .map(|s| s.parse::<f64>().unwrap_or(0.0))
                    .map_err(|_| sqlx::Error::RowNotFound)
            })
            .unwrap_or(0.0);

        result.push(DatabaseInfo {
            name,
            owner,
            size: format_bytes(size_bytes),
        });
    }

    Ok(result)
}

pub async fn list_schemas(
    pool: &MySqlPool,
    target_database: Option<&str>,
) -> Result<Vec<String>, AppError> {
    if let Some(db) = target_database {
        let trimmed = db.trim();
        if !trimmed.is_empty() {
            return Ok(vec![trimmed.to_string()]);
        }
    }

    let sql = r#"
        SELECT SCHEMA_NAME AS name
        FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')
        ORDER BY SCHEMA_NAME
    "#;

    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        if let Ok(name) = get_str_or_blob(&r, "name") {
            result.push(name);
        }
    }

    Ok(result)
}

pub async fn get_tree(
    pool: &MySqlPool,
    target_database: Option<&str>,
    search: Option<&str>,
) -> Result<Vec<SchemaTree>, AppError> {
    let db = target_database.unwrap_or("").trim();
    let has_db = !db.is_empty();

    let mut sql = String::from(
        r#"
        SELECT
            TABLE_SCHEMA AS `schema`,
            TABLE_NAME AS `name`,
            CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS `type`
        FROM information_schema.TABLES
        WHERE "#,
    );

    if has_db {
        sql.push_str("TABLE_SCHEMA = ?");
    } else {
        sql.push_str("(TABLE_SCHEMA = DATABASE() OR (DATABASE() IS NULL AND TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')))");
    }

    let search_clean = search.unwrap_or("").trim();
    let has_search = !search_clean.is_empty();
    if has_search {
        sql.push_str(" AND (TABLE_NAME LIKE ? OR TABLE_SCHEMA LIKE ?)");
    }

    sql.push_str(" ORDER BY TABLE_SCHEMA, TABLE_NAME");

    let mut query = sqlx::query(&sql);
    if has_db {
        query = query.bind(db);
    }
    if has_search {
        let pattern = format!("%{}%", search_clean);
        query = query.bind(pattern.clone()).bind(pattern);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut grouped: IndexMap<String, Vec<RelationEntry>> = IndexMap::new();
    for r in rows {
        let schema = get_str_or_blob(&r, "schema").unwrap_or_default();
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let rtype_str = get_str_or_blob(&r, "type").unwrap_or_else(|_| "table".to_string());
        let rtype = match rtype_str.as_str() {
            "view" => RelationType::View,
            _ => RelationType::Table,
        };

        grouped
            .entry(schema)
            .or_default()
            .push(RelationEntry { name, r#type: rtype });
    }

    let result = grouped
        .into_iter()
        .map(|(schema, relations)| SchemaTree { schema, relations })
        .collect();

    Ok(result)
}

pub async fn get_columns(
    pool: &MySqlPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<ColumnInfo>, AppError> {
    let target = match schema {
        Some(s) if !s.is_empty() => format!("`{}`.`{}`", s.replace('`', "``"), table.replace('`', "``")),
        _ => format!("`{}`", table.replace('`', "``")),
    };

    let show_sql = format!("SHOW FULL COLUMNS FROM {}", target);
    if let Ok(rows) = sqlx::query(&show_sql).fetch_all(pool).await {
        let mut result = Vec::new();
        for (i, r) in rows.iter().enumerate() {
            let field = get_str_or_blob(r, "Field").unwrap_or_default();
            let col_type = get_str_or_blob(r, "Type").unwrap_or_default();
            let is_null = get_str_or_blob(r, "Null").unwrap_or_default();
            let key = get_str_or_blob(r, "Key").unwrap_or_default();
            let default_val = get_opt_str_or_blob(r, "Default");

            let not_null = is_null == "NO";
            let is_primary_key = key == "PRI";
            let enum_values = parse_enum_values(&col_type);

            result.push(ColumnInfo {
                name: field,
                r#type: col_type,
                not_null,
                default: default_val,
                ordinal: (i + 1) as i32,
                is_primary_key,
                enum_values,
            });
        }
        return Ok(result);
    }

    // Fallback to information_schema.COLUMNS
    let sql = r#"
        SELECT
            COLUMN_NAME AS name,
            DATA_TYPE AS type,
            COLUMN_TYPE AS column_type,
            IS_NULLABLE AS is_nullable,
            COLUMN_DEFAULT AS `default`,
            ORDINAL_POSITION AS ordinal,
            COLUMN_KEY AS column_key
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = COALESCE(NULLIF(?, ''), DATABASE()) AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    "#;

    let rows = sqlx::query(sql)
        .bind(schema.unwrap_or(""))
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let col_type = get_str_or_blob(&r, "column_type")
            .or_else(|_| get_str_or_blob(&r, "type"))
            .unwrap_or_default();
        let is_nullable = get_str_or_blob(&r, "is_nullable").unwrap_or_default();
        let default_val = get_opt_str_or_blob(&r, "default");
        let ordinal: i32 = r
            .try_get::<i64, _>("ordinal")
            .map(|v| v as i32)
            .or_else(|_| r.try_get::<i32, _>("ordinal"))
            .unwrap_or(0);
        let column_key = get_str_or_blob(&r, "column_key").unwrap_or_default();

        let not_null = is_nullable == "NO";
        let is_primary_key = column_key == "PRI";
        let enum_values = parse_enum_values(&col_type);

        result.push(ColumnInfo {
            name,
            r#type: col_type,
            not_null,
            default: default_val,
            ordinal,
            is_primary_key,
            enum_values,
        });
    }

    Ok(result)
}

pub async fn get_indexes(
    pool: &MySqlPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<IndexInfo>, AppError> {
    let target = match schema {
        Some(s) if !s.is_empty() => format!("`{}`.`{}`", s.replace('`', "``"), table.replace('`', "``")),
        _ => format!("`{}`", table.replace('`', "``")),
    };

    let show_sql = format!("SHOW INDEX FROM {}", target);
    if let Ok(rows) = sqlx::query(&show_sql).fetch_all(pool).await {
        let mut map: IndexMap<String, (i64, String, Vec<String>)> = IndexMap::new();
        for r in &rows {
            let key_name = get_str_or_blob(r, "Key_name").unwrap_or_default();
            let non_unique: i64 = r
                .try_get::<i64, _>("Non_unique")
                .or_else(|_| r.try_get::<i32, _>("Non_unique").map(|v| v as i64))
                .unwrap_or(1);
            let index_type = get_str_or_blob(r, "Index_type").unwrap_or_else(|_| "BTREE".to_string());
            let col_name = get_str_or_blob(r, "Column_name").unwrap_or_default();

            if let Some(entry) = map.get_mut(&key_name) {
                entry.2.push(col_name);
            } else {
                map.insert(key_name, (non_unique, index_type, vec![col_name]));
            }
        }

        let mut result = Vec::new();
        for (name, (non_unique, index_type, cols)) in map {
            let is_primary = name == "PRIMARY";
            let is_unique = non_unique == 0;
            let cols_quoted = cols
                .iter()
                .map(|c| format!("`{}`", c.replace('`', "``")))
                .collect::<Vec<_>>()
                .join(", ");
            let definition = if is_primary {
                format!("PRIMARY KEY ({})", cols_quoted)
            } else {
                format!(
                    "{}INDEX `{}` ({}) USING {}",
                    if is_unique { "UNIQUE " } else { "" },
                    name.replace('`', "``"),
                    cols_quoted,
                    index_type
                )
            };
            result.push(IndexInfo {
                name,
                definition,
                is_unique,
                is_primary,
            });
        }
        return Ok(result);
    }

    // Fallback to information_schema.STATISTICS
    let sql = r#"
        SELECT
            INDEX_NAME AS name,
            NON_UNIQUE AS non_unique,
            INDEX_TYPE AS index_type,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = COALESCE(NULLIF(?, ''), DATABASE()) AND TABLE_NAME = ?
        GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
    "#;

    let rows = sqlx::query(sql)
        .bind(schema.unwrap_or(""))
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let non_unique: i64 = r
            .try_get::<i64, _>("non_unique")
            .or_else(|_| r.try_get::<i32, _>("non_unique").map(|v| v as i64))
            .unwrap_or(1);
        let index_type = get_str_or_blob(&r, "index_type").unwrap_or_else(|_| "BTREE".to_string());
        let cols_str = get_str_or_blob(&r, "columns").unwrap_or_default();

        let is_primary = name == "PRIMARY";
        let is_unique = non_unique == 0;
        let cols_quoted = cols_str
            .split(',')
            .map(|c| format!("`{}`", c.trim().replace('`', "``")))
            .collect::<Vec<_>>()
            .join(", ");

        let definition = if is_primary {
            format!("PRIMARY KEY ({})", cols_quoted)
        } else {
            format!(
                "{}INDEX `{}` ({}) USING {}",
                if is_unique { "UNIQUE " } else { "" },
                name.replace('`', "``"),
                cols_quoted,
                index_type
            )
        };

        result.push(IndexInfo {
            name,
            definition,
            is_unique,
            is_primary,
        });
    }

    Ok(result)
}

pub async fn get_constraints_and_fks(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
) -> Result<(Vec<ConstraintInfo>, Vec<CompletionForeignKey>), AppError> {
    let target = if !schema.is_empty() {
        format!("`{}`.`{}`", schema.replace('`', "``"), table.replace('`', "``"))
    } else {
        format!("`{}`", table.replace('`', "``"))
    };

    let show_sql = format!("SHOW CREATE TABLE {}", target);
    if let Ok(row) = sqlx::query(&show_sql).fetch_one(pool).await {
        if let Ok(ddl) = get_str_or_blob_idx(&row, 1) {
            return Ok(parse_show_create_table(&ddl, schema, table));
        }
    }

    // Fallback to information_schema
    let sql = r#"
        SELECT
            tc.CONSTRAINT_NAME AS name,
            tc.CONSTRAINT_TYPE AS type,
            kcu.COLUMN_NAME AS column_name,
            kcu.REFERENCED_TABLE_SCHEMA AS ref_schema,
            kcu.REFERENCED_TABLE_NAME AS ref_table,
            kcu.REFERENCED_COLUMN_NAME AS ref_column
        FROM information_schema.TABLE_CONSTRAINTS tc
        LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
            AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = COALESCE(NULLIF(?, ''), DATABASE()) AND tc.TABLE_NAME = ?
        ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    "#;

    let rows = sqlx::query(sql)
        .bind(schema)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut constraints = Vec::new();
    let mut foreign_keys_map: IndexMap<String, CompletionForeignKey> = IndexMap::new();

    for r in rows {
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let ctype = get_str_or_blob(&r, "type").unwrap_or_default();
        let col = get_opt_str_or_blob(&r, "column_name");
        let ref_schema = get_opt_str_or_blob(&r, "ref_schema");
        let ref_table = get_opt_str_or_blob(&r, "ref_table");
        let ref_col = get_opt_str_or_blob(&r, "ref_column");

        let col_quoted = col.as_deref().unwrap_or("");
        let mut definition = format!("{} (`{}`)", ctype, col_quoted.replace('`', "``"));
        if ctype == "FOREIGN KEY" {
            if let (Some(rt), Some(rc)) = (ref_table.as_deref(), ref_col.as_deref()) {
                let rs = ref_schema.as_deref().unwrap_or(schema);
                definition = format!(
                    "FOREIGN KEY (`{}`) REFERENCES `{}`.`{}` (`{}`)",
                    col_quoted.replace('`', "``"),
                    rs.replace('`', "``"),
                    rt.replace('`', "``"),
                    rc.replace('`', "``")
                );

                let key = format!("{}.{}.{}", schema, table, name);
                foreign_keys_map
                    .entry(key)
                    .and_modify(|fk| {
                        if let Some(c) = &col {
                            fk.columns.push(c.clone());
                        }
                        if let Some(rc_val) = &ref_col {
                            fk.ref_columns.push(rc_val.clone());
                        }
                    })
                    .or_insert_with(|| CompletionForeignKey {
                        schema: schema.to_string(),
                        table: table.to_string(),
                        columns: col.clone().map(|c| vec![c]).unwrap_or_default(),
                        ref_schema: rs.to_string(),
                        ref_table: rt.to_string(),
                        ref_columns: ref_col.clone().map(|rc_val| vec![rc_val]).unwrap_or_default(),
                    });
            }
        }

        constraints.push(ConstraintInfo {
            name,
            r#type: ctype,
            definition,
        });
    }

    Ok((constraints, foreign_keys_map.into_values().collect()))
}

pub async fn get_all_columns(
    pool: &MySqlPool,
    target_database: Option<&str>,
) -> Result<Vec<CompletionColumn>, AppError> {
    let db = target_database.unwrap_or("").trim();
    let has_db = !db.is_empty();

    let mut sql = String::from(
        r#"
        SELECT
            TABLE_SCHEMA AS `schema`,
            TABLE_NAME AS `table`,
            COLUMN_NAME AS `name`,
            DATA_TYPE AS `type`
        FROM information_schema.COLUMNS
        WHERE "#,
    );

    if has_db {
        sql.push_str("TABLE_SCHEMA = ?");
    } else {
        sql.push_str("(TABLE_SCHEMA = DATABASE() OR (DATABASE() IS NULL AND TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')))");
    }

    let mut query = sqlx::query(&sql);
    if has_db {
        query = query.bind(db);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        let schema = get_str_or_blob(&r, "schema").unwrap_or_default();
        let table = get_str_or_blob(&r, "table").unwrap_or_default();
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let col_type = get_str_or_blob(&r, "type").unwrap_or_default();

        result.push(CompletionColumn {
            schema,
            table,
            name,
            r#type: col_type,
        });
    }

    Ok(result)
}

pub async fn get_functions(
    pool: &MySqlPool,
    target_database: Option<&str>,
) -> Result<Vec<CompletionFunction>, AppError> {
    let db = target_database.unwrap_or("").trim();
    let has_db = !db.is_empty();

    let mut sql = String::from(
        r#"
        SELECT
            ROUTINE_SCHEMA AS `schema`,
            ROUTINE_NAME AS `name`,
            COALESCE(DTD_IDENTIFIER, DATA_TYPE, '') AS `returns`,
            '' AS `args`,
            LOWER(ROUTINE_TYPE) AS `kind`
        FROM information_schema.ROUTINES
        WHERE "#,
    );

    if has_db {
        sql.push_str("ROUTINE_SCHEMA = ?");
    } else {
        sql.push_str("(ROUTINE_SCHEMA = DATABASE() OR (DATABASE() IS NULL AND ROUTINE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')))");
    }

    let mut query = sqlx::query(&sql);
    if has_db {
        query = query.bind(db);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for r in rows {
        let schema = get_str_or_blob(&r, "schema").unwrap_or_default();
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let returns = get_str_or_blob(&r, "returns").unwrap_or_default();
        let args = get_str_or_blob(&r, "args").unwrap_or_default();
        let kind = get_str_or_blob(&r, "kind").unwrap_or_else(|_| "function".to_string());

        result.push(CompletionFunction {
            schema,
            name,
            args,
            returns,
            kind,
        });
    }

    Ok(result)
}

pub async fn get_foreign_keys(
    pool: &MySqlPool,
    target_database: Option<&str>,
) -> Result<Vec<CompletionForeignKey>, AppError> {
    let db = target_database.unwrap_or("").trim();
    let has_db = !db.is_empty();

    let mut sql = String::from(
        r#"
        SELECT
            CONSTRAINT_NAME AS name,
            TABLE_SCHEMA AS from_schema,
            TABLE_NAME AS from_table,
            COLUMN_NAME AS from_column,
            REFERENCED_TABLE_SCHEMA AS ref_schema,
            REFERENCED_TABLE_NAME AS ref_table,
            REFERENCED_COLUMN_NAME AS ref_column
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_NAME IS NOT NULL
        "#,
    );

    if has_db {
        sql.push_str(" AND TABLE_SCHEMA = ?");
    } else {
        sql.push_str(" AND (TABLE_SCHEMA = DATABASE() OR (DATABASE() IS NULL AND TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')))");
    }

    sql.push_str(" ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION");

    let mut query = sqlx::query(&sql);
    if has_db {
        query = query.bind(db);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut map: IndexMap<String, CompletionForeignKey> = IndexMap::new();
    for r in rows {
        let name = get_str_or_blob(&r, "name").unwrap_or_default();
        let from_schema = get_str_or_blob(&r, "from_schema").unwrap_or_default();
        let from_table = get_str_or_blob(&r, "from_table").unwrap_or_default();
        let from_column = get_str_or_blob(&r, "from_column").unwrap_or_default();
        let ref_schema = get_str_or_blob(&r, "ref_schema").unwrap_or_default();
        let ref_table = get_str_or_blob(&r, "ref_table").unwrap_or_default();
        let ref_column = get_str_or_blob(&r, "ref_column").unwrap_or_default();

        let key = format!("{}.{}.{}", from_schema, from_table, name);
        if let Some(existing) = map.get_mut(&key) {
            existing.columns.push(from_column);
            existing.ref_columns.push(ref_column);
        } else {
            map.insert(
                key,
                CompletionForeignKey {
                    schema: from_schema,
                    table: from_table,
                    columns: vec![from_column],
                    ref_schema,
                    ref_table,
                    ref_columns: vec![ref_column],
                },
            );
        }
    }

    Ok(map.into_values().collect())
}

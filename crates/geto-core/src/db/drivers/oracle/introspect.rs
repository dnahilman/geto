use indexmap::IndexMap;

use crate::db::types::{
    ColumnInfo, CompletionColumn, CompletionForeignKey, CompletionFunction,
    CompletionResponse, CompletionTable, ConstraintInfo, DatabaseInfo, IndexInfo,
    RelationEntry, RelationType, SchemaTree, TableDetailResponse,
};
use crate::error::AppError;

fn get_str(row: &oracle_rs::Row, cols: &[oracle_rs::ColumnInfo], col_name: &str) -> Option<String> {
    for (i, c) in cols.iter().enumerate() {
        if c.name.eq_ignore_ascii_case(col_name) {
            if let Some(v) = row.get(i) {
                return match v {
                    oracle_rs::Value::String(s) => Some(s.clone()),
                    oracle_rs::Value::Null => None,
                    other => other.as_str().map(|s| s.to_string()),
                };
            }
        }
    }
    None
}

fn get_i64(row: &oracle_rs::Row, cols: &[oracle_rs::ColumnInfo], col_name: &str) -> Option<i64> {
    for (i, c) in cols.iter().enumerate() {
        if c.name.eq_ignore_ascii_case(col_name) {
            if let Some(v) = row.get(i) {
                return match v {
                    oracle_rs::Value::Integer(n) => Some(*n),
                    oracle_rs::Value::Number(num) => num.to_i64().ok(),
                    _ => v.as_i64(),
                };
            }
        }
    }
    None
}

pub async fn list_databases(
    conn: &oracle_rs::Connection,
    default_name: &str,
) -> Result<Vec<DatabaseInfo>, AppError> {
    let sql = "SELECT sys_context('USERENV', 'DB_NAME') AS name FROM dual";
    let qr = conn
        .query(sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to list Oracle databases: {}", e)))?;

    let name = qr
        .rows
        .first()
        .and_then(|r| get_str(r, &qr.columns, "name"))
        .unwrap_or_else(|| {
            if default_name.is_empty() {
                "ORCL".to_string()
            } else {
                default_name.to_string()
            }
        });

    Ok(vec![DatabaseInfo {
        name,
        owner: "SYS".to_string(),
        size: "Unknown".to_string(),
    }])
}

pub async fn list_schemas(conn: &oracle_rs::Connection) -> Result<Vec<String>, AppError> {
    let sql = "SELECT username AS name FROM all_users ORDER BY username";
    let qr = conn
        .query(sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to list Oracle schemas: {}", e)))?;

    let mut out = Vec::new();
    for row in &qr.rows {
        if let Some(s) = get_str(row, &qr.columns, "name") {
            out.push(s);
        }
    }
    Ok(out)
}

pub async fn get_tree(
    conn: &oracle_rs::Connection,
    search: Option<&str>,
) -> Result<Vec<SchemaTree>, AppError> {
    let base_sql = r#"
        SELECT owner, table_name AS name, 'table' AS kind
        FROM all_tables
        WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS', 'ORDDATA', 'WMSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL', 'AUDSYS', 'APPQOSSYS', 'DBSNMP')
        UNION ALL
        SELECT owner, view_name AS name, 'view' AS kind
        FROM all_views
        WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS', 'ORDDATA', 'WMSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL', 'AUDSYS', 'APPQOSSYS', 'DBSNMP')
        ORDER BY owner, name
    "#;

    let qr = conn
        .query(base_sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to introspect Oracle schema tree: {}", e)))?;

    let search_lc = search.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());
    let mut map: IndexMap<String, Vec<RelationEntry>> = IndexMap::new();

    for row in &qr.rows {
        let schema = get_str(row, &qr.columns, "owner").unwrap_or_default();
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let kind = get_str(row, &qr.columns, "kind").unwrap_or_default();

        if let Some(ref pat) = search_lc {
            if !name.to_lowercase().contains(pat) {
                continue;
            }
        }

        let rel_type = match kind.as_str() {
            "view" => RelationType::View,
            _ => RelationType::Table,
        };

        map.entry(schema).or_default().push(RelationEntry {
            name,
            r#type: rel_type,
        });
    }

    let out = map
        .into_iter()
        .map(|(schema, relations)| SchemaTree { schema, relations })
        .collect();

    Ok(out)
}

pub async fn get_columns(
    conn: &oracle_rs::Connection,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<ColumnInfo>, AppError> {
    let sql = r#"
        SELECT
            c.column_name AS name,
            c.data_type AS type,
            c.nullable,
            c.data_default AS def_val,
            c.column_id AS ordinal,
            CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
        FROM all_tab_columns c
        LEFT JOIN (
            SELECT cc.owner, cc.table_name, cc.column_name
            FROM all_constraints con
            JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name AND con.owner = cc.owner
            WHERE con.constraint_type = 'P'
        ) pk ON c.owner = pk.owner AND c.table_name = pk.table_name AND c.column_name = pk.column_name
        WHERE UPPER(c.table_name) = UPPER(:1)
          AND (UPPER(c.owner) = UPPER(:2) OR :2 IS NULL)
        ORDER BY c.column_id
    "#;

    let tbl_val = oracle_rs::Value::String(table.to_string());
    let schema_val = schema
        .filter(|s| !s.is_empty())
        .map(|s| oracle_rs::Value::String(s.to_string()))
        .unwrap_or(oracle_rs::Value::Null);

    let qr = conn
        .query(sql, &[tbl_val, schema_val])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get Oracle columns: {}", e)))?;

    let mut out = Vec::with_capacity(qr.rows.len());
    for row in &qr.rows {
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let data_type = get_str(row, &qr.columns, "type").unwrap_or_else(|| "VARCHAR2".to_string());
        let nullable_str = get_str(row, &qr.columns, "nullable").unwrap_or_else(|| "Y".to_string());
        let default_val = get_str(row, &qr.columns, "def_val");
        let ordinal = get_i64(row, &qr.columns, "ordinal").unwrap_or(0) as i32;
        let is_pk = get_i64(row, &qr.columns, "is_pk").unwrap_or(0) == 1;

        out.push(ColumnInfo {
            name,
            r#type: data_type,
            not_null: nullable_str == "N",
            default: default_val,
            ordinal,
            is_primary_key: is_pk,
            enum_values: None,
        });
    }

    Ok(out)
}

pub async fn get_indexes(
    conn: &oracle_rs::Connection,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<IndexInfo>, AppError> {
    let sql = r#"
        SELECT
            i.index_name AS name,
            i.uniqueness,
            c.column_name,
            c.column_position,
            c.descend
        FROM all_indexes i
        JOIN all_ind_columns c ON i.index_name = c.index_name AND i.owner = c.index_owner
        WHERE UPPER(i.table_name) = UPPER(:1)
          AND (UPPER(i.owner) = UPPER(:2) OR :2 IS NULL)
        ORDER BY i.index_name, c.column_position
    "#;

    let tbl_val = oracle_rs::Value::String(table.to_string());
    let schema_val = schema
        .filter(|s| !s.is_empty())
        .map(|s| oracle_rs::Value::String(s.to_string()))
        .unwrap_or(oracle_rs::Value::Null);

    let qr = conn
        .query(sql, &[tbl_val, schema_val])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get Oracle indexes: {}", e)))?;

    let mut map: IndexMap<String, (bool, Vec<String>)> = IndexMap::new();

    for row in &qr.rows {
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let uniqueness = get_str(row, &qr.columns, "uniqueness").unwrap_or_default();
        let col = get_str(row, &qr.columns, "column_name").unwrap_or_default();
        let is_unique = uniqueness == "UNIQUE";

        let entry = map.entry(name).or_insert_with(|| (is_unique, Vec::new()));
        entry.1.push(col);
    }

    let out = map
        .into_iter()
        .map(|(name, (is_unique, columns))| IndexInfo {
            name,
            definition: format!("INDEX ({})", columns.join(", ")),
            is_unique,
            is_primary: false,
        })
        .collect();

    Ok(out)
}

pub async fn get_constraints(
    conn: &oracle_rs::Connection,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<ConstraintInfo>, AppError> {
    let sql = r#"
        SELECT
            con.constraint_name AS name,
            con.constraint_type AS type,
            cc.column_name,
            r_con.table_name AS ref_table,
            r_cc.column_name AS ref_column
        FROM all_constraints con
        JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name AND con.owner = cc.owner
        LEFT JOIN all_constraints r_con ON con.r_constraint_name = r_con.constraint_name AND con.r_owner = r_con.owner
        LEFT JOIN all_cons_columns r_cc ON r_con.constraint_name = r_cc.constraint_name AND r_con.owner = r_cc.owner
        WHERE UPPER(con.table_name) = UPPER(:1)
          AND (UPPER(con.owner) = UPPER(:2) OR :2 IS NULL)
        ORDER BY con.constraint_name, cc.position
    "#;

    let tbl_val = oracle_rs::Value::String(table.to_string());
    let schema_val = schema
        .filter(|s| !s.is_empty())
        .map(|s| oracle_rs::Value::String(s.to_string()))
        .unwrap_or(oracle_rs::Value::Null);

    let qr = conn
        .query(sql, &[tbl_val, schema_val])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get Oracle constraints: {}", e)))?;

    let mut map: IndexMap<String, (String, Vec<String>, Option<String>, Vec<String>)> = IndexMap::new();

    for row in &qr.rows {
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let ctype = get_str(row, &qr.columns, "type").unwrap_or_default();
        let col = get_str(row, &qr.columns, "column_name").unwrap_or_default();
        let ref_tbl = get_str(row, &qr.columns, "ref_table");
        let ref_col = get_str(row, &qr.columns, "ref_column");

        let entry = map
            .entry(name)
            .or_insert_with(|| (ctype, Vec::new(), ref_tbl, Vec::new()));
        entry.1.push(col);
        if let Some(rc) = ref_col {
            entry.3.push(rc);
        }
    }

    let out = map
        .into_iter()
        .map(|(name, (ctype, columns, ref_tbl, ref_cols))| {
            let mapped_type = match ctype.as_str() {
                "P" => "PRIMARY KEY",
                "U" => "UNIQUE",
                "R" => "FOREIGN KEY",
                "C" => "CHECK",
                _ => "CHECK",
            };
            let definition = if let Some(ref_t) = ref_tbl {
                format!(
                    "{} ({}) REFERENCES {} ({})",
                    mapped_type,
                    columns.join(", "),
                    ref_t,
                    ref_cols.join(", ")
                )
            } else {
                format!("{} ({})", mapped_type, columns.join(", "))
            };
            ConstraintInfo {
                name,
                r#type: mapped_type.to_string(),
                definition,
            }
        })
        .collect();

    Ok(out)
}

pub async fn get_table_foreign_keys(
    conn: &oracle_rs::Connection,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<CompletionForeignKey>, AppError> {
    let sql = r#"
        SELECT
            con.owner AS schema,
            con.table_name AS table_name,
            cc.column_name,
            r_con.owner AS ref_schema,
            r_con.table_name AS ref_table,
            r_cc.column_name AS ref_column
        FROM all_constraints con
        JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name AND con.owner = cc.owner
        JOIN all_constraints r_con ON con.r_constraint_name = r_con.constraint_name AND con.r_owner = r_con.owner
        JOIN all_cons_columns r_cc ON r_con.constraint_name = r_cc.constraint_name AND r_con.owner = r_cc.owner
        WHERE con.constraint_type = 'R'
          AND UPPER(con.table_name) = UPPER(:1)
          AND (UPPER(con.owner) = UPPER(:2) OR :2 IS NULL)
        ORDER BY con.constraint_name, cc.position
    "#;

    let tbl_val = oracle_rs::Value::String(table.to_string());
    let schema_val = schema
        .filter(|s| !s.is_empty())
        .map(|s| oracle_rs::Value::String(s.to_string()))
        .unwrap_or(oracle_rs::Value::Null);

    let qr = conn
        .query(sql, &[tbl_val, schema_val])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get Oracle foreign keys: {}", e)))?;

    let mut out = Vec::with_capacity(qr.rows.len());
    for row in &qr.rows {
        let sch = get_str(row, &qr.columns, "schema").unwrap_or_default();
        let tbl = get_str(row, &qr.columns, "table_name").unwrap_or_else(|| table.to_string());
        let column = get_str(row, &qr.columns, "column_name").unwrap_or_default();
        let ref_sch = get_str(row, &qr.columns, "ref_schema").unwrap_or_default();
        let ref_table = get_str(row, &qr.columns, "ref_table").unwrap_or_default();
        let ref_column = get_str(row, &qr.columns, "ref_column").unwrap_or_default();

        out.push(CompletionForeignKey {
            schema: sch,
            table: tbl,
            columns: vec![column],
            ref_schema: ref_sch,
            ref_table,
            ref_columns: vec![ref_column],
        });
    }

    Ok(out)
}

pub async fn get_table_detail(
    conn: &oracle_rs::Connection,
    schema: Option<&str>,
    table: &str,
) -> Result<TableDetailResponse, AppError> {
    let columns = get_columns(conn, schema, table).await?;
    let indexes = get_indexes(conn, schema, table).await?;
    let constraints = get_constraints(conn, schema, table).await?;
    let foreign_keys = get_table_foreign_keys(conn, schema, table).await?;

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

pub async fn get_all_columns(conn: &oracle_rs::Connection) -> Result<Vec<CompletionColumn>, AppError> {
    let sql = r#"
        SELECT
            c.owner AS schema,
            c.table_name AS table_name,
            c.column_name AS name,
            c.data_type AS type
        FROM all_tab_columns c
        WHERE c.owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'CTXSYS', 'MDSYS')
        ORDER BY c.owner, c.table_name, c.column_id
    "#;

    let qr = conn
        .query(sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get all columns: {}", e)))?;

    let mut out = Vec::with_capacity(qr.rows.len());
    for row in &qr.rows {
        let schema = get_str(row, &qr.columns, "schema").unwrap_or_default();
        let table = get_str(row, &qr.columns, "table_name").unwrap_or_default();
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let data_type = get_str(row, &qr.columns, "type").unwrap_or_default();

        out.push(CompletionColumn {
            schema,
            table,
            name,
            r#type: data_type,
        });
    }

    Ok(out)
}

pub async fn get_functions(conn: &oracle_rs::Connection) -> Result<Vec<CompletionFunction>, AppError> {
    let sql = r#"
        SELECT
            object_name AS name,
            owner AS schema,
            object_type AS type
        FROM all_objects
        WHERE object_type IN ('FUNCTION', 'PROCEDURE', 'PACKAGE')
          AND owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'CTXSYS', 'MDSYS')
        ORDER BY owner, object_name
    "#;

    let qr = conn
        .query(sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get Oracle functions: {}", e)))?;

    let mut out = Vec::new();
    for row in &qr.rows {
        let name = get_str(row, &qr.columns, "name").unwrap_or_default();
        let schema = get_str(row, &qr.columns, "schema").unwrap_or_default();
        let otype = get_str(row, &qr.columns, "type").unwrap_or_default();

        out.push(CompletionFunction {
            schema,
            name,
            args: String::new(),
            returns: otype,
            kind: "function".to_string(),
        });
    }

    // Built-in functions
    let builtins = [
        ("NVL", "expr1, expr2"),
        ("NVL2", "expr1, expr2, expr3"),
        ("DECODE", "expr, search, result, default"),
        ("COALESCE", "expr1, expr2, ..."),
        ("TO_CHAR", "val, format"),
        ("TO_DATE", "str, format"),
        ("TO_NUMBER", "str, format"),
        ("SYSDATE", ""),
        ("SYSTIMESTAMP", ""),
        ("TRUNC", "date, format"),
        ("SUBSTR", "str, pos, len"),
        ("INSTR", "str, sub, pos, nth"),
        ("LENGTH", "str"),
        ("UPPER", "str"),
        ("LOWER", "str"),
        ("INITCAP", "str"),
        ("LPAD", "str, len, pad"),
        ("RPAD", "str, len, pad"),
        ("LTRIM", "str, set"),
        ("RTRIM", "str, set"),
        ("TRIM", "str"),
        ("REPLACE", "str, search, repl"),
        ("REGEXP_SUBSTR", "str, pattern"),
        ("REGEXP_REPLACE", "str, pattern, repl"),
        ("REGEXP_LIKE", "str, pattern"),
        ("LISTAGG", "measure_expr, delimiter"),
        ("COUNT", "expr"),
        ("SUM", "expr"),
        ("AVG", "expr"),
        ("MIN", "expr"),
        ("MAX", "expr"),
        ("DENSE_RANK", ""),
        ("ROW_NUMBER", ""),
    ];

    for (name, args) in builtins {
        out.push(CompletionFunction {
            schema: "SYS".to_string(),
            name: name.to_string(),
            args: args.to_string(),
            returns: String::new(),
            kind: "function".to_string(),
        });
    }

    Ok(out)
}

pub async fn get_foreign_keys(conn: &oracle_rs::Connection) -> Result<Vec<CompletionForeignKey>, AppError> {
    let sql = r#"
        SELECT
            con.owner AS schema,
            con.table_name,
            cc.column_name,
            r_con.owner AS ref_schema,
            r_con.table_name AS ref_table,
            r_cc.column_name AS ref_column
        FROM all_constraints con
        JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name AND con.owner = cc.owner
        JOIN all_constraints r_con ON con.r_constraint_name = r_con.constraint_name AND con.r_owner = r_con.owner
        JOIN all_cons_columns r_cc ON r_con.constraint_name = r_cc.constraint_name AND r_con.owner = r_cc.owner
        WHERE con.constraint_type = 'R'
          AND con.owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'CTXSYS', 'MDSYS')
        ORDER BY con.constraint_name, cc.position
    "#;

    let qr = conn
        .query(sql, &[])
        .await
        .map_err(|e| AppError::Database(format!("Failed to get completion foreign keys: {}", e)))?;

    let mut out = Vec::with_capacity(qr.rows.len());
    for row in &qr.rows {
        let sch = get_str(row, &qr.columns, "schema").unwrap_or_default();
        let table = get_str(row, &qr.columns, "table_name").unwrap_or_default();
        let column = get_str(row, &qr.columns, "column_name").unwrap_or_default();
        let ref_sch = get_str(row, &qr.columns, "ref_schema").unwrap_or_default();
        let ref_table = get_str(row, &qr.columns, "ref_table").unwrap_or_default();
        let ref_column = get_str(row, &qr.columns, "ref_column").unwrap_or_default();

        out.push(CompletionForeignKey {
            schema: sch,
            table,
            columns: vec![column],
            ref_schema: ref_sch,
            ref_table,
            ref_columns: vec![ref_column],
        });
    }

    Ok(out)
}

pub async fn get_completion(conn: &oracle_rs::Connection) -> Result<CompletionResponse, AppError> {
    let tree = get_tree(conn, None).await.unwrap_or_default();

    let mut tables = Vec::new();
    for st in &tree {
        for rel in &st.relations {
            tables.push(CompletionTable {
                schema: st.schema.clone(),
                name: rel.name.clone(),
                r#type: rel.r#type,
            });
        }
    }

    let columns = get_all_columns(conn).await.unwrap_or_default();
    let functions = get_functions(conn).await.unwrap_or_default();
    let foreign_keys = get_foreign_keys(conn).await.unwrap_or_default();

    Ok(CompletionResponse {
        tables,
        columns,
        functions,
        foreign_keys,
    })
}

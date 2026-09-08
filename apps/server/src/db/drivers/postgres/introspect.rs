use indexmap::IndexMap;
use sqlx::{PgPool, Row};

use crate::db::types::{
    ColumnInfo, CompletionColumn, CompletionForeignKey, CompletionFunction,
    ConstraintInfo, DatabaseInfo, IndexInfo, RelationEntry, RelationType, SchemaTree,
};
use crate::error::AppError;

pub async fn list_databases(pool: &PgPool) -> Result<Vec<DatabaseInfo>, AppError> {
    let sql = r#"
        SELECT d.datname AS name,
               pg_catalog.pg_get_userbyid(d.datdba) AS owner,
               pg_size_pretty(pg_database_size(d.datname)) AS size
        FROM pg_database d
        WHERE d.datistemplate = false
        ORDER BY d.datname
    "#;
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(DatabaseInfo {
            name: row.try_get("name").unwrap_or_default(),
            owner: row.try_get("owner").unwrap_or_default(),
            size: row.try_get("size").unwrap_or_default(),
        });
    }
    Ok(out)
}

pub async fn list_schemas(pool: &PgPool) -> Result<Vec<String>, AppError> {
    let sql = r#"
        SELECT nspname FROM pg_namespace
        WHERE nspname NOT IN ('information_schema') AND nspname NOT LIKE 'pg_%'
        ORDER BY nspname
    "#;
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        if let Ok(name) = row.try_get::<String, _>("nspname") {
            out.push(name);
        }
    }
    Ok(out)
}

pub async fn get_tree(pool: &PgPool, search: Option<&str>) -> Result<Vec<SchemaTree>, AppError> {
    let pattern = search
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s));

    let sql = r#"
        SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','v','m','p')
          AND n.nspname NOT IN ('information_schema')
          AND n.nspname NOT LIKE 'pg_%'
          AND ($1::text IS NULL OR c.relname ILIKE $1)
        ORDER BY n.nspname, c.relname
    "#;

    let rows = sqlx::query(sql)
        .bind(pattern)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut map: IndexMap<String, Vec<RelationEntry>> = IndexMap::new();
    for row in rows {
        let schema: String = row.try_get("schema").unwrap_or_default();
        let name: String = row.try_get("name").unwrap_or_default();
        let kind: String = row.try_get("kind").unwrap_or_default();
        let rel_type = match kind.as_str() {
            "v" => RelationType::View,
            "m" => RelationType::Matview,
            _ => RelationType::Table,
        };
        map.entry(schema)
            .or_default()
            .push(RelationEntry { name, r#type: rel_type });
    }

    let out = map
        .into_iter()
        .map(|(schema, relations)| SchemaTree { schema, relations })
        .collect();
    Ok(out)
}

pub async fn get_columns(
    pool: &PgPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<ColumnInfo>, AppError> {
    let schema_name = schema.unwrap_or("public");
    let sql = r#"
        SELECT a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type,
               a.attnotnull AS not_null,
               pg_get_expr(d.adbin, d.adrelid) AS default,
               a.attnum AS ordinal,
               COALESCE(pk.is_pk, false) AS is_pk,
               CASE WHEN t.typtype = 'e' THEN (
                 SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
                 FROM pg_enum e WHERE e.enumtypid = t.oid
               ) END AS enum_values
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        LEFT JOIN LATERAL (
          SELECT true AS is_pk
          FROM pg_index i
          WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
        ) pk ON true
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    "#;

    let rows = sqlx::query(sql)
        .bind(schema_name)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let ordinal_i16: i16 = row.try_get("ordinal").unwrap_or(0);
        out.push(ColumnInfo {
            name: row.try_get("name").unwrap_or_default(),
            r#type: row.try_get("type").unwrap_or_default(),
            not_null: row.try_get("not_null").unwrap_or(false),
            default: row.try_get("default").ok(),
            ordinal: ordinal_i16 as i32,
            is_primary_key: row.try_get("is_pk").unwrap_or(false),
            enum_values: row.try_get("enum_values").ok(),
        });
    }
    Ok(out)
}

pub async fn get_indexes(
    pool: &PgPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<IndexInfo>, AppError> {
    let schema_name = schema.unwrap_or("public");
    let sql = r#"
        SELECT i.relname AS name,
               pg_get_indexdef(ix.indexrelid) AS definition,
               ix.indisunique AS is_unique,
               ix.indisprimary AS is_primary
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1 AND t.relname = $2
        ORDER BY i.relname
    "#;

    let rows = sqlx::query(sql)
        .bind(schema_name)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(IndexInfo {
            name: row.try_get("name").unwrap_or_default(),
            definition: row.try_get("definition").unwrap_or_default(),
            is_unique: row.try_get("is_unique").unwrap_or(false),
            is_primary: row.try_get("is_primary").unwrap_or(false),
        });
    }
    Ok(out)
}

pub async fn get_constraints(
    pool: &PgPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<ConstraintInfo>, AppError> {
    let schema_name = schema.unwrap_or("public");
    let sql = r#"
        SELECT con.conname AS name, con.contype::text AS contype,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
        ORDER BY con.conname
    "#;

    let rows = sqlx::query(sql)
        .bind(schema_name)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let raw_type: String = row.try_get("contype").unwrap_or_default();
        let constraint_type = match raw_type.as_str() {
            "p" => "PRIMARY KEY".to_string(),
            "f" => "FOREIGN KEY".to_string(),
            "u" => "UNIQUE".to_string(),
            "c" => "CHECK".to_string(),
            "x" => "EXCLUDE".to_string(),
            other => other.to_string(),
        };
        out.push(ConstraintInfo {
            name: row.try_get("name").unwrap_or_default(),
            r#type: constraint_type,
            definition: row.try_get("definition").unwrap_or_default(),
        });
    }
    Ok(out)
}

pub async fn get_table_foreign_keys(
    pool: &PgPool,
    schema: Option<&str>,
    table: &str,
) -> Result<Vec<CompletionForeignKey>, AppError> {
    let schema_name = schema.unwrap_or("public");
    let sql = r#"
        SELECT n.nspname AS schema,
               c.relname AS table,
               ARRAY(
                 SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS columns,
               fn.nspname AS ref_schema,
               fc.relname AS ref_table,
               ARRAY(
                 SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS ref_columns
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class fc ON fc.oid = con.confrelid
        JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname = $1 AND c.relname = $2
        ORDER BY con.conname
    "#;

    let rows = sqlx::query(sql)
        .bind(schema_name)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(CompletionForeignKey {
            schema: row.try_get("schema").unwrap_or_default(),
            table: row.try_get("table").unwrap_or_default(),
            columns: row.try_get("columns").unwrap_or_default(),
            ref_schema: row.try_get("ref_schema").unwrap_or_default(),
            ref_table: row.try_get("ref_table").unwrap_or_default(),
            ref_columns: row.try_get("ref_columns").unwrap_or_default(),
        });
    }
    Ok(out)
}

pub async fn get_all_columns(pool: &PgPool) -> Result<Vec<CompletionColumn>, AppError> {
    let sql = r#"
        SELECT n.nspname AS schema, c.relname AS table, a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','v','m','p')
          AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY n.nspname, c.relname, a.attnum
    "#;

    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(CompletionColumn {
            schema: row.try_get("schema").unwrap_or_default(),
            table: row.try_get("table").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            r#type: row.try_get("type").unwrap_or_default(),
        });
    }
    Ok(out)
}

pub async fn get_functions(pool: &PgPool) -> Result<Vec<CompletionFunction>, AppError> {
    let sql = r#"
        SELECT n.nspname AS schema,
               p.proname AS name,
               pg_get_function_arguments(p.oid) AS args,
               pg_get_function_result(p.oid) AS returns,
               p.prokind::text AS kind
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
          AND p.prokind IN ('f','p','a','w')
        ORDER BY n.nspname, p.proname
    "#;

    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let raw_kind: String = row.try_get("kind").unwrap_or_default();
        let kind = match raw_kind.as_str() {
            "f" => "function".to_string(),
            "p" => "procedure".to_string(),
            "a" => "aggregate".to_string(),
            "w" => "window".to_string(),
            _ => "function".to_string(),
        };
        out.push(CompletionFunction {
            schema: row.try_get("schema").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            args: row.try_get("args").unwrap_or_default(),
            returns: row.try_get("returns").unwrap_or_default(),
            kind,
        });
    }
    Ok(out)
}

pub async fn get_foreign_keys(pool: &PgPool) -> Result<Vec<CompletionForeignKey>, AppError> {
    let sql = r#"
        SELECT n.nspname AS schema,
               c.relname AS table,
               ARRAY(
                 SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS columns,
               fn.nspname AS ref_schema,
               fc.relname AS ref_table,
               ARRAY(
                 SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS ref_columns
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class fc ON fc.oid = con.confrelid
        JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
        ORDER BY n.nspname, c.relname
    "#;

    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(CompletionForeignKey {
            schema: row.try_get("schema").unwrap_or_default(),
            table: row.try_get("table").unwrap_or_default(),
            columns: row.try_get("columns").unwrap_or_default(),
            ref_schema: row.try_get("ref_schema").unwrap_or_default(),
            ref_table: row.try_get("ref_table").unwrap_or_default(),
            ref_columns: row.try_get("ref_columns").unwrap_or_default(),
        });
    }
    Ok(out)
}

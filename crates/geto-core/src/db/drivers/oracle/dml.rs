use crate::db::types::ColumnSpec;
use crate::error::AppError;

pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn rel(schema: Option<&str>, table: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => {
            format!("{}.{}", quote_ident(s), quote_ident(table))
        }
        _ => quote_ident(table),
    }
}

pub fn format_literal(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "1".to_string()
            } else {
                "0".to_string()
            }
        }
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => {
            format!("'{}'", s.replace('\'', "''"))
        }
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

pub fn inline_params(text: &str, params: &[serde_json::Value]) -> String {
    let mut out = text.to_string();
    // Replace :1, :2, etc. starting from highest index down to avoid prefix collision (e.g. :10 vs :1)
    for idx in (1..=params.len()).rev() {
        let ph = format!(":{}", idx);
        let literal = format_literal(&params[idx - 1]);
        out = out.replace(&ph, &literal);
    }
    out
}

pub fn build_insert(
    schema: Option<&str>,
    table: &str,
    values: &serde_json::Map<String, serde_json::Value>,
) -> (String, Vec<serde_json::Value>) {
    let cols: Vec<&String> = values.keys().collect();
    if cols.is_empty() {
        return (
            format!("INSERT INTO {} () VALUES ()", rel(schema, table)),
            Vec::new(),
        );
    }

    let cols_str = cols
        .iter()
        .map(|c| quote_ident(c))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=cols.len())
        .map(|i| format!(":{}", i))
        .collect::<Vec<_>>()
        .join(", ");
    let text = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        rel(schema, table),
        cols_str,
        placeholders
    );
    let params = cols
        .iter()
        .map(|c| values.get(*c).cloned().unwrap_or(serde_json::Value::Null))
        .collect();
    (text, params)
}

pub fn build_update(
    schema: Option<&str>,
    table: &str,
    pk: &serde_json::Map<String, serde_json::Value>,
    values: &serde_json::Map<String, serde_json::Value>,
) -> Result<(String, Vec<serde_json::Value>), AppError> {
    if values.is_empty() {
        return Err(AppError::BadRequest("No columns to update".to_string()));
    }
    if pk.is_empty() {
        return Err(AppError::BadRequest(
            "Refusing to update without a primary key".to_string(),
        ));
    }

    let mut params = Vec::new();
    let mut sets = Vec::new();
    for (k, v) in values {
        params.push(v.clone());
        sets.push(format!("{} = :{}", quote_ident(k), params.len()));
    }

    let mut wheres = Vec::new();
    for (k, v) in pk {
        params.push(v.clone());
        wheres.push(format!("{} = :{}", quote_ident(k), params.len()));
    }

    let text = format!(
        "UPDATE {} SET {} WHERE {}",
        rel(schema, table),
        sets.join(", "),
        wheres.join(" AND ")
    );

    Ok((text, params))
}

pub fn build_delete(
    schema: Option<&str>,
    table: &str,
    pk: &serde_json::Map<String, serde_json::Value>,
) -> Result<(String, Vec<serde_json::Value>), AppError> {
    if pk.is_empty() {
        return Err(AppError::BadRequest(
            "Refusing to delete without a primary key".to_string(),
        ));
    }

    let mut params = Vec::new();
    let mut wheres = Vec::new();
    for (k, v) in pk {
        params.push(v.clone());
        wheres.push(format!("{} = :{}", quote_ident(k), params.len()));
    }

    let text = format!(
        "DELETE FROM {} WHERE {}",
        rel(schema, table),
        wheres.join(" AND ")
    );

    Ok((text, params))
}

pub fn build_create_table(
    schema: Option<&str>,
    table: &str,
    columns: &[ColumnSpec],
) -> Result<String, AppError> {
    if columns.is_empty() {
        return Err(AppError::BadRequest(
            "Cannot create a table with no columns".to_string(),
        ));
    }

    let mut col_defs = Vec::new();
    let mut pks = Vec::new();

    for col in columns {
        let col_name = quote_ident(&col.name);
        let data_type = map_spec_type(&col.r#type);

        let mut parts = vec![format!("{} {}", col_name, data_type)];

        if let Some(ref def) = col.default {
            if !def.trim().is_empty() {
                parts.push(format!("DEFAULT {}", def));
            }
        }

        if col.not_null == Some(true) {
            parts.push("NOT NULL".to_string());
        }

        col_defs.push(parts.join(" "));

        if col.primary_key == Some(true) {
            pks.push(col_name);
        }
    }

    if !pks.is_empty() {
        col_defs.push(format!("PRIMARY KEY ({})", pks.join(", ")));
    }

    Ok(format!(
        "CREATE TABLE {} (\n  {}\n)",
        rel(schema, table),
        col_defs.join(",\n  ")
    ))
}

fn map_spec_type(t: &str) -> &'static str {
    match t.to_uppercase().as_str() {
        "INTEGER" | "INT" | "INT4" => "NUMBER(38)",
        "BIGINT" | "INT8" => "NUMBER(38)",
        "SMALLINT" | "INT2" => "NUMBER(10)",
        "REAL" | "FLOAT" | "FLOAT4" => "BINARY_FLOAT",
        "DOUBLE" | "DOUBLE PRECISION" | "FLOAT8" => "BINARY_DOUBLE",
        "NUMERIC" | "DECIMAL" => "NUMBER",
        "BOOLEAN" | "BOOL" => "NUMBER(1)",
        "TEXT" | "VARCHAR" | "STRING" => "VARCHAR2(4000)",
        "CLOB" => "CLOB",
        "BLOB" => "BLOB",
        "DATE" => "DATE",
        "TIMESTAMP" | "DATETIME" => "TIMESTAMP",
        "JSON" => "CLOB",
        _ => "VARCHAR2(4000)",
    }
}

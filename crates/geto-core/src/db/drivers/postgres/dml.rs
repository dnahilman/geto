use crate::db::types::ColumnSpec;
use crate::error::AppError;

pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn rel(schema: Option<&str>, table: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => format!("{}.{}", quote_ident(s), quote_ident(table)),
        _ => quote_ident(table),
    }
}

pub fn format_literal(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
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
    let re = regex::Regex::new(r"\$(\d+)").unwrap();
    re.replace_all(text, |caps: &regex::Captures| {
        if let Some(m) = caps.get(1) {
            if let Ok(idx) = m.as_str().parse::<usize>() {
                if idx > 0 && idx <= params.len() {
                    return format_literal(&params[idx - 1]);
                }
            }
        }
        caps[0].to_string()
    })
    .to_string()
}

pub fn build_insert(
    schema: Option<&str>,
    table: &str,
    values: &serde_json::Map<String, serde_json::Value>,
) -> (String, Vec<serde_json::Value>) {
    let cols: Vec<&String> = values.keys().collect();
    if cols.is_empty() {
        return (
            format!("INSERT INTO {} DEFAULT VALUES RETURNING *", rel(schema, table)),
            Vec::new(),
        );
    }

    let cols_str = cols
        .iter()
        .map(|c| quote_ident(c))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=cols.len())
        .map(|i| format!("${}", i))
        .collect::<Vec<_>>()
        .join(", ");
    let text = format!(
        "INSERT INTO {} ({}) VALUES ({}) RETURNING *",
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
    let mut set_clauses = Vec::new();
    for (col, val) in values {
        params.push(val.clone());
        set_clauses.push(format!("{} = ${}", quote_ident(col), params.len()));
    }

    let mut where_clauses = Vec::new();
    for (col, val) in pk {
        params.push(val.clone());
        where_clauses.push(format!("{} = ${}", quote_ident(col), params.len()));
    }

    let text = format!(
        "UPDATE {} SET {} WHERE {} RETURNING *",
        rel(schema, table),
        set_clauses.join(", "),
        where_clauses.join(" AND ")
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
    let mut where_clauses = Vec::new();
    for (col, val) in pk {
        params.push(val.clone());
        where_clauses.push(format!("{} = ${}", quote_ident(col), params.len()));
    }

    let text = format!(
        "DELETE FROM {} WHERE {} RETURNING *",
        rel(schema, table),
        where_clauses.join(" AND ")
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
            "A table needs at least one column".to_string(),
        ));
    }
    let type_re = regex::Regex::new(r"^[A-Za-z][A-Za-z0-9 _().,\[\]]*$")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut defs = Vec::new();
    let mut pks = Vec::new();
    for c in columns {
        if !type_re.is_match(&c.r#type) {
            return Err(AppError::BadRequest(format!(
                "Invalid column type: {}",
                c.r#type
            )));
        }
        let mut def = format!("{} {}", quote_ident(&c.name), c.r#type);
        if c.not_null.unwrap_or(false) {
            def.push_str(" NOT NULL");
        }
        if let Some(ref d) = c.default {
            if !d.is_empty() {
                def.push_str(&format!(" DEFAULT {}", d));
            }
        }
        defs.push(def);
        if c.primary_key.unwrap_or(false) {
            pks.push(quote_ident(&c.name));
        }
    }
    if !pks.is_empty() {
        defs.push(format!("PRIMARY KEY ({})", pks.join(", ")));
    }

    Ok(format!(
        "CREATE TABLE {} (\n  {}\n)",
        rel(schema, table),
        defs.join(",\n  ")
    ))
}

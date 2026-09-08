use serde::{Deserialize, Serialize};
use sqlx::{Column, Row, TypeInfo};

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMeta {
    pub name: String,
    #[serde(rename = "dataTypeID")]
    pub data_type_id: i32,
    pub type_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_table: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_column: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ColumnMeta>,
    #[schema(value_type = Vec<Vec<Object>>)]
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub command: Option<String>,
}

pub fn map_mysql_type(tname: &str) -> (i32, &'static str) {
    match tname {
        "TINYINT" | "BOOLEAN" => (1, "tinyint"),
        "SMALLINT" => (2, "smallint"),
        "INT" | "INTEGER" | "MEDIUMINT" => (3, "int"),
        "FLOAT" => (4, "float"),
        "DOUBLE" => (5, "double"),
        "TIMESTAMP" => (7, "timestamp"),
        "BIGINT" => (8, "bigint"),
        "DATE" => (10, "date"),
        "TIME" => (11, "time"),
        "DATETIME" => (12, "datetime"),
        "YEAR" => (13, "year"),
        "VARCHAR" | "CHAR" | "TEXT" => (253, "var_string"),
        "JSON" => (245, "json"),
        "DECIMAL" | "NEWDECIMAL" => (246, "newdecimal"),
        "ENUM" => (247, "enum"),
        _ => (253, "var_string"),
    }
}

pub fn detect_command(sql: &str) -> Option<String> {
    let trimmed = sql.trim_start();
    let word: String = trimmed
        .chars()
        .take_while(|c| c.is_alphabetic())
        .collect();
    if word.is_empty() {
        None
    } else {
        Some(word.to_uppercase())
    }
}

pub fn marshal_mysql_row(row: &sqlx::mysql::MySqlRow) -> Vec<serde_json::Value> {
    let mut row_vals = Vec::with_capacity(row.columns().len());
    for (i, col) in row.columns().iter().enumerate() {
        let tname = col.type_info().name();
        let json_val: serde_json::Value = match tname {
            "TINYINT" | "BOOLEAN" => row
                .try_get::<i8, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "SMALLINT" => row
                .try_get::<i16, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "INT" | "INTEGER" | "MEDIUMINT" => row
                .try_get::<i32, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "BIGINT" => row
                .try_get::<i64, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "FLOAT" => row
                .try_get::<f32, _>(i)
                .and_then(|v| {
                    serde_json::Number::from_f64(v as f64)
                        .ok_or(sqlx::Error::Decode("invalid float".into()))
                })
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            "DOUBLE" => row
                .try_get::<f64, _>(i)
                .and_then(|v| {
                    serde_json::Number::from_f64(v)
                        .ok_or(sqlx::Error::Decode("invalid float".into()))
                })
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            "DATE" => row
                .try_get::<chrono::NaiveDate, _>(i)
                .map(|d| serde_json::Value::String(d.format("%Y-%m-%d").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "DATETIME" | "TIMESTAMP" => {
                if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                    serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                } else if let Ok(dt) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                    serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                } else {
                    serde_json::Value::Null
                }
            }
            "TIME" => row
                .try_get::<chrono::NaiveTime, _>(i)
                .map(|t| serde_json::Value::String(t.format("%H:%M:%S").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "JSON" => {
                if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                    v
                } else if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::from_str(&s).unwrap_or(serde_json::Value::String(s))
                } else {
                    serde_json::Value::Null
                }
            }
            _ => {
                if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(s)
                } else if let Ok(b) = row.try_get::<Vec<u8>, _>(i) {
                    serde_json::Value::String(String::from_utf8_lossy(&b).to_string())
                } else {
                    serde_json::Value::Null
                }
            }
        };
        row_vals.push(json_val);
    }
    row_vals
}

pub fn marshal_mysql_rows(rows: &[sqlx::mysql::MySqlRow], sql: &str) -> QueryResult {
    let columns: Vec<ColumnMeta> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let (type_id, type_name) = map_mysql_type(c.type_info().name());
                ColumnMeta {
                    name: c.name().to_string(),
                    data_type_id: type_id,
                    type_name: type_name.to_string(),
                    source_table: Some(1),
                    source_column: Some((i + 1) as i32),
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    let mut json_rows = Vec::with_capacity(rows.len());
    for row in rows {
        json_rows.push(marshal_mysql_row(row));
    }

    let command = detect_command(sql);
    let row_count = json_rows.len();

    QueryResult {
        columns,
        rows: json_rows,
        row_count,
        command,
    }
}

pub fn map_pg_type(oid: Option<u32>, name: &str) -> (i32, String) {
    if let Some(oid) = oid {
        let tname = match oid {
            16 => "bool",
            17 => "bytea",
            18 => "char",
            20 => "int8",
            21 => "int2",
            23 => "int4",
            25 => "text",
            26 => "oid",
            114 => "json",
            700 => "float4",
            701 => "float8",
            1042 => "bpchar",
            1043 => "varchar",
            1082 => "date",
            1083 => "time",
            1114 => "timestamp",
            1184 => "timestamptz",
            1186 => "interval",
            1700 => "numeric",
            2950 => "uuid",
            3802 => "jsonb",
            1000 => "bool[]",
            1005 => "int2[]",
            1007 => "int4[]",
            1016 => "int8[]",
            1009 => "text[]",
            1015 => "varchar[]",
            3807 => "jsonb[]",
            other => return (other as i32, name.to_lowercase()),
        };
        (oid as i32, tname.to_string())
    } else {
        (0, name.to_lowercase())
    }
}

pub fn marshal_pg_row(row: &sqlx::postgres::PgRow) -> Vec<serde_json::Value> {
    use sqlx::ValueRef;
    let mut row_vals = Vec::with_capacity(row.columns().len());
    for (i, col) in row.columns().iter().enumerate() {
        if let Ok(raw) = row.try_get_raw(i) {
            if raw.is_null() {
                row_vals.push(serde_json::Value::Null);
                continue;
            }
        }

        let tname = col.type_info().name();
        let json_val: serde_json::Value = match tname {
            "BOOL" => row
                .try_get::<bool, _>(i)
                .map(serde_json::Value::Bool)
                .unwrap_or(serde_json::Value::Null),
            "INT2" => row
                .try_get::<i16, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "INT4" => row
                .try_get::<i32, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "INT8" => row
                .try_get::<i64, _>(i)
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "FLOAT4" => row
                .try_get::<f32, _>(i)
                .and_then(|v| {
                    serde_json::Number::from_f64(v as f64)
                        .ok_or(sqlx::Error::Decode("invalid float".into()))
                })
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            "FLOAT8" => row
                .try_get::<f64, _>(i)
                .and_then(|v| {
                    serde_json::Number::from_f64(v)
                        .ok_or(sqlx::Error::Decode("invalid float".into()))
                })
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            "NUMERIC" => row
                .try_get::<rust_decimal::Decimal, _>(i)
                .map(|d| serde_json::Value::String(d.to_string()))
                .or_else(|_| row.try_get::<String, _>(i).map(serde_json::Value::String))
                .unwrap_or(serde_json::Value::Null),
            "UUID" => row
                .try_get::<uuid::Uuid, _>(i)
                .map(|u| serde_json::Value::String(u.to_string()))
                .unwrap_or(serde_json::Value::Null),
            "DATE" => row
                .try_get::<chrono::NaiveDate, _>(i)
                .map(|d| serde_json::Value::String(d.format("%Y-%m-%d").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "TIME" => row
                .try_get::<chrono::NaiveTime, _>(i)
                .map(|t| serde_json::Value::String(t.format("%H:%M:%S").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "TIMESTAMP" => row
                .try_get::<chrono::NaiveDateTime, _>(i)
                .map(|dt| serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "TIMESTAMPTZ" => row
                .try_get::<chrono::DateTime<chrono::Utc>, _>(i)
                .map(|dt| serde_json::Value::String(dt.to_rfc3339()))
                .unwrap_or(serde_json::Value::Null),
            "JSON" | "JSONB" => {
                if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                    v
                } else if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::from_str(&s).unwrap_or(serde_json::Value::String(s))
                } else {
                    serde_json::Value::Null
                }
            }
            "BYTEA" => row
                .try_get::<Vec<u8>, _>(i)
                .map(|b| serde_json::Value::String(format!("\\x{}", hex::encode(b))))
                .unwrap_or(serde_json::Value::Null),
            "_TEXT" | "TEXT[]" | "_VARCHAR" | "VARCHAR[]" => row
                .try_get::<Vec<String>, _>(i)
                .map(|arr| serde_json::Value::Array(arr.into_iter().map(serde_json::Value::String).collect()))
                .unwrap_or(serde_json::Value::Null),
            "_INT4" | "INT4[]" => row
                .try_get::<Vec<i32>, _>(i)
                .map(|arr| serde_json::Value::Array(arr.into_iter().map(|n| serde_json::Value::Number(n.into())).collect()))
                .unwrap_or(serde_json::Value::Null),
            "_INT8" | "INT8[]" => row
                .try_get::<Vec<i64>, _>(i)
                .map(|arr| serde_json::Value::Array(arr.into_iter().map(|n| serde_json::Value::Number(n.into())).collect()))
                .unwrap_or(serde_json::Value::Null),
            "_BOOL" | "BOOL[]" => row
                .try_get::<Vec<bool>, _>(i)
                .map(|arr| serde_json::Value::Array(arr.into_iter().map(serde_json::Value::Bool).collect()))
                .unwrap_or(serde_json::Value::Null),
            _ => {
                if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(s)
                } else if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                    v
                } else if let Ok(b) = row.try_get::<Vec<u8>, _>(i) {
                    serde_json::Value::String(String::from_utf8_lossy(&b).to_string())
                } else {
                    serde_json::Value::Null
                }
            }
        };
        row_vals.push(json_val);
    }
    row_vals
}

pub fn marshal_pg_rows(rows: &[sqlx::postgres::PgRow], sql: &str) -> QueryResult {
    let columns: Vec<ColumnMeta> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let oid = c.type_info().oid().map(|o| o.0);
                let (type_id, type_name) = map_pg_type(oid, c.type_info().name());
                ColumnMeta {
                    name: c.name().to_string(),
                    data_type_id: type_id,
                    type_name,
                    source_table: Some(1),
                    source_column: Some((i + 1) as i32),
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    let mut json_rows = Vec::with_capacity(rows.len());
    for row in rows {
        json_rows.push(marshal_pg_row(row));
    }

    let command = detect_command(sql);
    let row_count = json_rows.len();

    QueryResult {
        columns,
        rows: json_rows,
        row_count,
        command,
    }
}


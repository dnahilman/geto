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

pub fn map_sqlite_type(tname: &str) -> (i32, &'static str) {
    let upper = tname.to_uppercase();
    if upper.contains("INT") {
        (1, "integer")
    } else if upper.contains("CHAR")
        || upper.contains("CLOB")
        || upper.contains("TEXT")
        || upper.is_empty()
    {
        (3, "text")
    } else if upper.contains("BLOB") {
        (4, "blob")
    } else if upper.contains("REAL") || upper.contains("FLOA") || upper.contains("DOUB") {
        (2, "real")
    } else if upper.contains("BOOL") {
        (6, "boolean")
    } else if upper.contains("DATE") || upper.contains("TIME") {
        (7, "datetime")
    } else if upper.contains("NUMERIC") || upper.contains("DECIMAL") {
        (246, "numeric")
    } else if upper.contains("JSON") {
        (245, "json")
    } else {
        (3, "text")
    }
}

pub fn marshal_sqlite_row(row: &sqlx::sqlite::SqliteRow) -> Vec<serde_json::Value> {
    use sqlx::ValueRef;
    let mut row_vals = Vec::with_capacity(row.columns().len());
    for (i, col) in row.columns().iter().enumerate() {
        if let Ok(raw) = row.try_get_raw(i) {
            if raw.is_null() {
                row_vals.push(serde_json::Value::Null);
                continue;
            }
        }

        let tname = col.type_info().name().to_uppercase();
        let val = if tname == "BOOLEAN" || tname == "BOOL" {
            row.try_get::<bool, _>(i)
                .map(serde_json::Value::Bool)
                .or_else(|_| row.try_get::<i64, _>(i).map(|n| serde_json::Value::Bool(n != 0)))
                .unwrap_or(serde_json::Value::Null)
        } else if tname.contains("INT") {
            row.try_get::<i64, _>(i)
                .map(|n| serde_json::Value::Number(n.into()))
                .unwrap_or(serde_json::Value::Null)
        } else if tname.contains("REAL") || tname.contains("FLOA") || tname.contains("DOUB") {
            row.try_get::<f64, _>(i)
                .ok()
                .and_then(serde_json::Number::from_f64)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null)
        } else if tname.contains("BLOB") {
            row.try_get::<Vec<u8>, _>(i)
                .map(|b| serde_json::Value::String(format!("\\x{}", hex::encode(b))))
                .unwrap_or(serde_json::Value::Null)
        } else if tname.contains("JSON") {
            if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                v
            } else if let Ok(s) = row.try_get::<String, _>(i) {
                serde_json::from_str(&s).unwrap_or(serde_json::Value::String(s))
            } else {
                serde_json::Value::Null
            }
        } else if tname.contains("TEXT") || tname.contains("CHAR") || tname.contains("CLOB") {
            row.try_get::<String, _>(i)
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null)
        } else {
            // Dynamic typing fallback
            if let Ok(n) = row.try_get::<i64, _>(i) {
                serde_json::Value::Number(n.into())
            } else if let Ok(f) = row.try_get::<f64, _>(i) {
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            } else if let Ok(s) = row.try_get::<String, _>(i) {
                serde_json::Value::String(s)
            } else if let Ok(b) = row.try_get::<Vec<u8>, _>(i) {
                serde_json::Value::String(format!("\\x{}", hex::encode(b)))
            } else {
                serde_json::Value::Null
            }
        };
        row_vals.push(val);
    }
    row_vals
}

pub fn marshal_sqlite_rows(rows: &[sqlx::sqlite::SqliteRow], sql: &str) -> QueryResult {
    let columns: Vec<ColumnMeta> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let (type_id, type_name) = map_sqlite_type(c.type_info().name());
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
        json_rows.push(marshal_sqlite_row(row));
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

pub fn map_oracle_type(t: oracle_rs::OracleType) -> (i32, &'static str) {
    match t {
        oracle_rs::OracleType::Varchar => (253, "varchar2"),
        oracle_rs::OracleType::Number => (246, "number"),
        oracle_rs::OracleType::Date => (10, "date"),
        oracle_rs::OracleType::Timestamp
        | oracle_rs::OracleType::TimestampTz
        | oracle_rs::OracleType::TimestampLtz => (7, "timestamp"),
        oracle_rs::OracleType::Raw | oracle_rs::OracleType::LongRaw => (251, "raw"),
        oracle_rs::OracleType::Clob => (252, "clob"),
        oracle_rs::OracleType::Blob => (252, "blob"),
        oracle_rs::OracleType::Boolean => (1, "boolean"),
        oracle_rs::OracleType::Json => (245, "json"),
        oracle_rs::OracleType::Rowid | oracle_rs::OracleType::Urowid => (11, "rowid"),
        oracle_rs::OracleType::BinaryFloat => (4, "binary_float"),
        oracle_rs::OracleType::BinaryDouble => (5, "binary_double"),
        _ => (253, "varchar2"),
    }
}

pub fn marshal_oracle_value(val: &oracle_rs::Value) -> serde_json::Value {
    match val {
        oracle_rs::Value::Null => serde_json::Value::Null,
        oracle_rs::Value::String(s) => serde_json::Value::String(s.clone()),
        oracle_rs::Value::Bytes(b) => serde_json::Value::String(format!("\\x{}", hex::encode(b))),
        oracle_rs::Value::Integer(i) => serde_json::Value::Number((*i).into()),
        oracle_rs::Value::Float(f) => serde_json::Number::from_f64(*f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        oracle_rs::Value::Number(num) => {
            let s = num.as_str();
            if let Ok(i) = s.parse::<i64>() {
                serde_json::Value::Number(i.into())
            } else if let Ok(f) = s.parse::<f64>() {
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or_else(|| serde_json::Value::String(s.to_string()))
            } else {
                serde_json::Value::String(s.to_string())
            }
        }
        oracle_rs::Value::Date(d) => serde_json::Value::String(format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            d.year, d.month, d.day, d.hour, d.minute, d.second
        )),
        oracle_rs::Value::Timestamp(t) => {
            if t.has_timezone() {
                serde_json::Value::String(format!(
                    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:06}{:+03}:{:02}",
                    t.year,
                    t.month,
                    t.day,
                    t.hour,
                    t.minute,
                    t.second,
                    t.microsecond,
                    t.tz_hour_offset,
                    t.tz_minute_offset.abs()
                ))
            } else {
                serde_json::Value::String(format!(
                    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:06}",
                    t.year, t.month, t.day, t.hour, t.minute, t.second, t.microsecond
                ))
            }
        }
        oracle_rs::Value::RowId(r) => {
            if let Some(s) = r.to_string() {
                serde_json::Value::String(s)
            } else {
                serde_json::Value::String(format!("{}:{}:{}:{}", r.rba, r.partition_id, r.block_num, r.slot_num))
            }
        }
        oracle_rs::Value::Boolean(b) => serde_json::Value::Bool(*b),
        oracle_rs::Value::Lob(lob) => match lob {
            oracle_rs::LobValue::Inline(bytes) => {
                if let Ok(s) = std::str::from_utf8(bytes) {
                    serde_json::Value::String(s.to_string())
                } else {
                    serde_json::Value::String(format!("\\x{}", hex::encode(bytes)))
                }
            }
            oracle_rs::LobValue::Locator(_) => serde_json::Value::String("[LOB Locator]".to_string()),
            oracle_rs::LobValue::Empty => serde_json::Value::String(String::new()),
            oracle_rs::LobValue::Null => serde_json::Value::Null,
        },
        oracle_rs::Value::Json(j) => j.clone(),
        oracle_rs::Value::Vector(v) => match v {
            oracle_rs::OracleVector::Dense(data) => match data {
                oracle_rs::VectorData::Float32(f) => {
                    let items: Vec<serde_json::Value> = f
                        .iter()
                        .map(|&val| {
                            serde_json::Number::from_f64(val as f64)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        })
                        .collect();
                    serde_json::Value::Array(items)
                }
                oracle_rs::VectorData::Float64(f) => {
                    let items: Vec<serde_json::Value> = f
                        .iter()
                        .map(|&val| {
                            serde_json::Number::from_f64(val)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        })
                        .collect();
                    serde_json::Value::Array(items)
                }
                oracle_rs::VectorData::Int8(i) => {
                    let items: Vec<serde_json::Value> = i
                        .iter()
                        .map(|&val| serde_json::Value::Number(val.into()))
                        .collect();
                    serde_json::Value::Array(items)
                }
                oracle_rs::VectorData::Binary(b) => {
                    serde_json::Value::String(format!("\\x{}", hex::encode(b)))
                }
            },
            oracle_rs::OracleVector::Sparse(_) => {
                serde_json::Value::String("[Sparse Vector]".to_string())
            }
        },
        oracle_rs::Value::Cursor(c) => {
            serde_json::Value::String(format!("[Cursor ID: {}]", c.cursor_id()))
        }
        oracle_rs::Value::Collection(col) => {
            serde_json::Value::String(format!("[Collection: {}]", col.type_name))
        }
    }
}

pub fn marshal_oracle_rows(qr: oracle_rs::QueryResult, sql: &str) -> QueryResult {
    let columns: Vec<ColumnMeta> = qr
        .columns
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let (type_id, type_name) = map_oracle_type(c.oracle_type);
            ColumnMeta {
                name: c.name.clone(),
                data_type_id: type_id,
                type_name: type_name.to_string(),
                source_table: Some(1),
                source_column: Some((i + 1) as i32),
            }
        })
        .collect();

    let mut json_rows = Vec::with_capacity(qr.rows.len());
    for row in qr.rows {
        let row_vals = row
            .values()
            .iter()
            .map(marshal_oracle_value)
            .collect::<Vec<serde_json::Value>>();
        json_rows.push(row_vals);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_command() {
        assert_eq!(detect_command("SELECT * FROM users"), Some("SELECT".to_string()));
        assert_eq!(detect_command("  insert into tbl values (1)"), Some("INSERT".to_string()));
        assert_eq!(detect_command("\n\tUPDATE tbl SET a = 1"), Some("UPDATE".to_string()));
        assert_eq!(detect_command("DELETE FROM tbl"), Some("DELETE".to_string()));
        assert_eq!(detect_command("WITH cte AS (...) SELECT * FROM cte"), Some("WITH".to_string()));
        assert_eq!(detect_command(""), None);
        assert_eq!(detect_command("   "), None);
        assert_eq!(detect_command("1234"), None);
    }

    #[test]
    fn test_map_mysql_type() {
        assert_eq!(map_mysql_type("TINYINT"), (1, "tinyint"));
        assert_eq!(map_mysql_type("BOOLEAN"), (1, "tinyint"));
        assert_eq!(map_mysql_type("SMALLINT"), (2, "smallint"));
        assert_eq!(map_mysql_type("INT"), (3, "int"));
        assert_eq!(map_mysql_type("INTEGER"), (3, "int"));
        assert_eq!(map_mysql_type("FLOAT"), (4, "float"));
        assert_eq!(map_mysql_type("DOUBLE"), (5, "double"));
        assert_eq!(map_mysql_type("TIMESTAMP"), (7, "timestamp"));
        assert_eq!(map_mysql_type("BIGINT"), (8, "bigint"));
        assert_eq!(map_mysql_type("DATE"), (10, "date"));
        assert_eq!(map_mysql_type("TIME"), (11, "time"));
        assert_eq!(map_mysql_type("DATETIME"), (12, "datetime"));
        assert_eq!(map_mysql_type("YEAR"), (13, "year"));
        assert_eq!(map_mysql_type("VARCHAR"), (253, "var_string"));
        assert_eq!(map_mysql_type("CHAR"), (253, "var_string"));
        assert_eq!(map_mysql_type("JSON"), (245, "json"));
        assert_eq!(map_mysql_type("DECIMAL"), (246, "newdecimal"));
        assert_eq!(map_mysql_type("ENUM"), (247, "enum"));
        assert_eq!(map_mysql_type("UNKNOWN_TYPE"), (253, "var_string"));
    }
}



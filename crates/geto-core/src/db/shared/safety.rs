use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::db::shared::split::split_statements;

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StatementRisk {
    pub command: String,
    pub dangerous: bool,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SafetyReport {
    pub statements: Vec<StatementRisk>,
    pub dangerous: bool,
    pub reasons: Vec<String>,
    pub parse_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectInspection {
    pub single_select: bool,
    pub has_limit: bool,
}

fn strip_comments_and_strings(sql: &str) -> String {
    let re_comments = Regex::new(r"(?m)(--[^\n]*|#[^\n]*|/\*[\s\S]*?\*/)").unwrap();
    let stripped = re_comments.replace_all(sql, " ");

    let re_strings = Regex::new(r#"('[^']*'|"[^"]*")"#).unwrap();
    re_strings.replace_all(&stripped, "''").to_string()
}

pub fn analyze_statement(stmt: &str) -> StatementRisk {
    let clean = strip_comments_and_strings(stmt);
    let trimmed = clean.trim();

    let re_cmd = Regex::new(r"(?i)^([a-z]+)").unwrap();
    let command = re_cmd
        .captures(trimmed)
        .map(|c| c[1].to_uppercase())
        .unwrap_or_else(|| "UNKNOWN".to_string());

    let mut reasons = Vec::new();

    let re_where = Regex::new(r"(?i)\bWHERE\b").unwrap();

    match command.as_str() {
        "DELETE" => {
            if !re_where.is_match(trimmed) {
                reasons.push("DELETE without a WHERE clause — every row in the table will be deleted.".to_string());
            }
        }
        "UPDATE" => {
            if !re_where.is_match(trimmed) {
                reasons.push("UPDATE without a WHERE clause — every row in the table will be modified.".to_string());
            }
        }
        "TRUNCATE" => {
            reasons.push("TRUNCATE removes all rows from the table(s).".to_string());
        }
        "DROP" => {
            reasons.push("DROP permanently removes the object and its data.".to_string());
        }
        "ALTER" => {
            let re_drop_col = Regex::new(r"(?i)\bDROP\b").unwrap();
            if re_drop_col.is_match(trimmed) {
                reasons.push("ALTER TABLE … DROP permanently removes a column or constraint.".to_string());
            }
        }
        _ => {}
    }

    StatementRisk {
        command,
        dangerous: !reasons.is_empty(),
        reasons,
    }
}

pub fn analyze_sql(sql: &str) -> SafetyReport {
    let stmts = split_statements(sql);
    let mut statements = Vec::new();
    let mut all_reasons = Vec::new();
    let mut dangerous = false;

    for stmt in stmts {
        let risk = analyze_statement(&stmt);
        if risk.dangerous {
            dangerous = true;
            all_reasons.extend(risk.reasons.clone());
        }
        statements.push(risk);
    }

    SafetyReport {
        statements,
        dangerous,
        reasons: all_reasons,
        parse_error: None,
    }
}

pub fn inspect_select(sql: &str) -> SelectInspection {
    let stmts = split_statements(sql);
    if stmts.len() != 1 {
        return SelectInspection {
            single_select: false,
            has_limit: false,
        };
    }

    let stmt = &stmts[0];
    let clean = strip_comments_and_strings(stmt);
    let trimmed = clean.trim();

    let re_select = Regex::new(r"(?i)^SELECT\b").unwrap();
    let single_select = re_select.is_match(trimmed);

    let re_limit = Regex::new(r"(?i)\bLIMIT\b").unwrap();
    let has_limit = re_limit.is_match(trimmed);

    SelectInspection {
        single_select,
        has_limit,
    }
}

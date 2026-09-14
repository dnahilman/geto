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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_queries() {
        let report = analyze_sql("SELECT * FROM users WHERE id = 1;");
        assert!(!report.dangerous);
        assert!(report.reasons.is_empty());
        assert_eq!(report.statements.len(), 1);
        assert_eq!(report.statements[0].command, "SELECT");

        let report = analyze_sql("EXPLAIN SELECT 1;");
        assert!(!report.dangerous);
        assert_eq!(report.statements[0].command, "EXPLAIN");
    }

    #[test]
    fn test_delete_without_where_flagged_dangerous() {
        let report = analyze_sql("DELETE FROM users;");
        assert!(report.dangerous);
        assert_eq!(report.reasons.len(), 1);
        assert!(report.reasons[0].contains("DELETE without a WHERE clause"));
    }

    #[test]
    fn test_delete_with_where_is_safe() {
        let report = analyze_sql("DELETE FROM users WHERE id = 42;");
        assert!(!report.dangerous);
        assert!(report.reasons.is_empty());
    }

    #[test]
    fn test_update_without_where_flagged_dangerous() {
        let report = analyze_sql("UPDATE users SET is_active = false;");
        assert!(report.dangerous);
        assert_eq!(report.reasons.len(), 1);
        assert!(report.reasons[0].contains("UPDATE without a WHERE clause"));
    }

    #[test]
    fn test_update_with_where_is_safe() {
        let report = analyze_sql("UPDATE users SET is_active = false WHERE id = 1;");
        assert!(!report.dangerous);
        assert!(report.reasons.is_empty());
    }

    #[test]
    fn test_truncate_and_drop_flagged_dangerous() {
        let report = analyze_sql("TRUNCATE TABLE session_logs;");
        assert!(report.dangerous);
        assert!(report.reasons[0].contains("TRUNCATE removes all rows"));

        let report = analyze_sql("DROP TABLE old_records;");
        assert!(report.dangerous);
        assert!(report.reasons[0].contains("DROP permanently removes"));
    }

    #[test]
    fn test_alter_table_drop_column() {
        let report = analyze_sql("ALTER TABLE users DROP COLUMN obsolete_field;");
        assert!(report.dangerous);
        assert!(report.reasons[0].contains("ALTER TABLE … DROP permanently removes"));

        let report_safe = analyze_sql("ALTER TABLE users ADD COLUMN new_field INT;");
        assert!(!report_safe.dangerous);
    }

    #[test]
    fn test_multi_statement_safety() {
        let sql = "SELECT * FROM users; DELETE FROM audit_logs; SELECT 1;";
        let report = analyze_sql(sql);
        assert!(report.dangerous);
        assert_eq!(report.statements.len(), 3);
        assert_eq!(report.statements[1].command, "DELETE");
        assert!(report.statements[1].dangerous);
    }

    #[test]
    fn test_inspect_select() {
        let res = inspect_select("SELECT * FROM items LIMIT 10;");
        assert!(res.single_select);
        assert!(res.has_limit);

        let res = inspect_select("SELECT * FROM items;");
        assert!(res.single_select);
        assert!(!res.has_limit);

        let res = inspect_select("INSERT INTO items (id) VALUES (1);");
        assert!(!res.single_select);
        assert!(!res.has_limit);

        let res = inspect_select("SELECT 1; SELECT 2;");
        assert!(!res.single_select);
        assert!(!res.has_limit);
    }
}

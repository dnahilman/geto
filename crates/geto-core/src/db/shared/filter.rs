use crate::db::shared::ident::{quote_ident_mysql, quote_ident_pg};
use crate::db::types::{TableFilterGroup, TableFilterRule};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterDialect {
    Postgres,
    Mysql,
    Sqlite,
    Oracle,
}

/// Builds a parameterized WHERE clause from legacy single-column filter and multi-rule TableFilterGroup.
/// Appends parameter values directly to `params`.
/// Returns `Some(clause_without_WHERE)` if any conditions exist, or `None` if empty.
pub fn build_where_clause(
    dialect: FilterDialect,
    legacy_col: Option<&str>,
    legacy_val: Option<&str>,
    filter_group: Option<&TableFilterGroup>,
    params: &mut Vec<serde_json::Value>,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();

    // 1. Legacy single filter (e.g. from foreign key tab navigation)
    if let (Some(col), Some(val)) = (legacy_col, legacy_val) {
        if !col.trim().is_empty() {
            let quoted = match dialect {
                FilterDialect::Postgres | FilterDialect::Sqlite | FilterDialect::Oracle => {
                    quote_ident_pg(col)
                }
                FilterDialect::Mysql => quote_ident_mysql(col),
            };

            params.push(serde_json::Value::String(val.to_string()));
            let placeholder = match dialect {
                FilterDialect::Postgres => format!("${}", params.len()),
                FilterDialect::Oracle => format!(":{}", params.len()),
                FilterDialect::Mysql | FilterDialect::Sqlite => "?".to_string(),
            };
            parts.push(format!("{} = {}", quoted, placeholder));
        }
    }

    // 2. Multi-rule FilterGroup
    if let Some(group) = filter_group {
        let mut group_conds: Vec<String> = Vec::new();

        for rule in &group.rules {
            if let Some(cond) = build_single_rule_condition(dialect, rule, params) {
                group_conds.push(cond);
            }
        }

        if !group_conds.is_empty() {
            let conj = if group.conjunction.eq_ignore_ascii_case("OR") {
                " OR "
            } else {
                " AND "
            };

            if group_conds.len() == 1 {
                parts.push(group_conds.remove(0));
            } else {
                parts.push(format!("({})", group_conds.join(conj)));
            }
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" AND "))
    }
}

fn build_single_rule_condition(
    dialect: FilterDialect,
    rule: &TableFilterRule,
    params: &mut Vec<serde_json::Value>,
) -> Option<String> {
    let col = rule.column.trim();
    if col.is_empty() {
        return None;
    }

    let op = rule.operator.trim().to_lowercase();
    let quoted = match dialect {
        FilterDialect::Postgres | FilterDialect::Sqlite | FilterDialect::Oracle => {
            quote_ident_pg(col)
        }
        FilterDialect::Mysql => quote_ident_mysql(col),
    };

    // Unary operators (no value required)
    match op.as_str() {
        "is_null" => return Some(format!("{} IS NULL", quoted)),
        "is_not_null" => return Some(format!("{} IS NOT NULL", quoted)),
        "is_empty" => {
            return match dialect {
                FilterDialect::Postgres | FilterDialect::Sqlite => {
                    Some(format!("({} IS NULL OR CAST({} AS TEXT) = '')", quoted, quoted))
                }
                FilterDialect::Mysql => {
                    Some(format!("({} IS NULL OR CAST({} AS CHAR) = '')", quoted, quoted))
                }
                FilterDialect::Oracle => {
                    Some(format!("({} IS NULL OR TO_CHAR({}) = '')", quoted, quoted))
                }
            };
        }
        "is_not_empty" => {
            return match dialect {
                FilterDialect::Postgres | FilterDialect::Sqlite => {
                    Some(format!("({} IS NOT NULL AND CAST({} AS TEXT) != '')", quoted, quoted))
                }
                FilterDialect::Mysql => {
                    Some(format!("({} IS NOT NULL AND CAST({} AS CHAR) != '')", quoted, quoted))
                }
                FilterDialect::Oracle => {
                    Some(format!("({} IS NOT NULL AND TO_CHAR({}) != '')", quoted, quoted))
                }
            };
        }
        _ => {}
    }

    // Binary operators require a non-empty string value
    let raw_val = rule.value.as_deref()?.trim();
    if raw_val.is_empty() {
        return None;
    }

    // Parse numeric value if possible
    let is_numeric = raw_val.parse::<i64>().is_ok() || raw_val.parse::<f64>().is_ok();

    match op.as_str() {
        "equals" => {
            if is_numeric {
                push_param(raw_val, true, params);
                let ph = placeholder(dialect, params.len());
                Some(format!("{} = {}", quoted, ph))
            } else {
                push_param(raw_val, false, params);
                let ph = placeholder(dialect, params.len());
                match dialect {
                    FilterDialect::Postgres | FilterDialect::Sqlite => {
                        Some(format!("CAST({} AS TEXT) = {}", quoted, ph))
                    }
                    FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) = {}", quoted, ph)),
                    FilterDialect::Oracle => Some(format!("TO_CHAR({}) = {}", quoted, ph)),
                }
            }
        }
        "not_equals" => {
            if is_numeric {
                push_param(raw_val, true, params);
                let ph = placeholder(dialect, params.len());
                Some(format!("{} != {}", quoted, ph))
            } else {
                push_param(raw_val, false, params);
                let ph = placeholder(dialect, params.len());
                match dialect {
                    FilterDialect::Postgres | FilterDialect::Sqlite => {
                        Some(format!("CAST({} AS TEXT) != {}", quoted, ph))
                    }
                    FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) != {}", quoted, ph)),
                    FilterDialect::Oracle => Some(format!("TO_CHAR({}) != {}", quoted, ph)),
                }
            }
        }
        "contains" => {
            params.push(serde_json::Value::String(format!("%{}%", raw_val)));
            let ph = placeholder(dialect, params.len());
            match dialect {
                FilterDialect::Postgres => Some(format!("CAST({} AS TEXT) ILIKE {}", quoted, ph)),
                FilterDialect::Sqlite => Some(format!("CAST({} AS TEXT) LIKE {}", quoted, ph)),
                FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) LIKE {}", quoted, ph)),
                FilterDialect::Oracle => {
                    Some(format!("LOWER(TO_CHAR({})) LIKE LOWER({})", quoted, ph))
                }
            }
        }
        "not_contains" => {
            params.push(serde_json::Value::String(format!("%{}%", raw_val)));
            let ph = placeholder(dialect, params.len());
            match dialect {
                FilterDialect::Postgres => {
                    Some(format!("CAST({} AS TEXT) NOT ILIKE {}", quoted, ph))
                }
                FilterDialect::Sqlite => {
                    Some(format!("CAST({} AS TEXT) NOT LIKE {}", quoted, ph))
                }
                FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) NOT LIKE {}", quoted, ph)),
                FilterDialect::Oracle => {
                    Some(format!("LOWER(TO_CHAR({})) NOT LIKE LOWER({})", quoted, ph))
                }
            }
        }
        "starts_with" => {
            params.push(serde_json::Value::String(format!("{}%", raw_val)));
            let ph = placeholder(dialect, params.len());
            match dialect {
                FilterDialect::Postgres => Some(format!("CAST({} AS TEXT) ILIKE {}", quoted, ph)),
                FilterDialect::Sqlite => Some(format!("CAST({} AS TEXT) LIKE {}", quoted, ph)),
                FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) LIKE {}", quoted, ph)),
                FilterDialect::Oracle => {
                    Some(format!("LOWER(TO_CHAR({})) LIKE LOWER({})", quoted, ph))
                }
            }
        }
        "ends_with" => {
            params.push(serde_json::Value::String(format!("%{}", raw_val)));
            let ph = placeholder(dialect, params.len());
            match dialect {
                FilterDialect::Postgres => Some(format!("CAST({} AS TEXT) ILIKE {}", quoted, ph)),
                FilterDialect::Sqlite => Some(format!("CAST({} AS TEXT) LIKE {}", quoted, ph)),
                FilterDialect::Mysql => Some(format!("CAST({} AS CHAR) LIKE {}", quoted, ph)),
                FilterDialect::Oracle => {
                    Some(format!("LOWER(TO_CHAR({})) LIKE LOWER({})", quoted, ph))
                }
            }
        }
        "greater_than" => {
            push_param(raw_val, is_numeric, params);
            let ph = placeholder(dialect, params.len());
            Some(format!("{} > {}", quoted, ph))
        }
        "greater_than_or_equal" => {
            push_param(raw_val, is_numeric, params);
            let ph = placeholder(dialect, params.len());
            Some(format!("{} >= {}", quoted, ph))
        }
        "less_than" => {
            push_param(raw_val, is_numeric, params);
            let ph = placeholder(dialect, params.len());
            Some(format!("{} < {}", quoted, ph))
        }
        "less_than_or_equal" => {
            push_param(raw_val, is_numeric, params);
            let ph = placeholder(dialect, params.len());
            Some(format!("{} <= {}", quoted, ph))
        }
        _ => None,
    }
}

fn placeholder(dialect: FilterDialect, pos: usize) -> String {
    match dialect {
        FilterDialect::Postgres => format!("${}", pos),
        FilterDialect::Oracle => format!(":{}", pos),
        FilterDialect::Mysql | FilterDialect::Sqlite => "?".to_string(),
    }
}

fn push_param(raw: &str, is_numeric: bool, params: &mut Vec<serde_json::Value>) {
    if is_numeric {
        if let Ok(i) = raw.parse::<i64>() {
            params.push(serde_json::Value::Number(i.into()));
            return;
        }
        if let Ok(f) = raw.parse::<f64>() {
            if let Some(n) = serde_json::Number::from_f64(f) {
                params.push(serde_json::Value::Number(n));
                return;
            }
        }
    }
    params.push(serde_json::Value::String(raw.to_string()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_filter() {
        let mut params = Vec::new();
        let where_clause = build_where_clause(FilterDialect::Postgres, None, None, None, &mut params);
        assert!(where_clause.is_none());
        assert!(params.is_empty());
    }

    #[test]
    fn test_legacy_filter_pg() {
        let mut params = Vec::new();
        let where_clause =
            build_where_clause(FilterDialect::Postgres, Some("user_id"), Some("42"), None, &mut params);
        assert_eq!(where_clause.as_deref(), Some("\"user_id\" = $1"));
        assert_eq!(params.len(), 1);
        assert_eq!(params[0], serde_json::Value::String("42".to_string()));
    }

    #[test]
    fn test_multi_rules_pg() {
        let mut params = Vec::new();
        let group = TableFilterGroup {
            conjunction: "AND".to_string(),
            rules: vec![
                TableFilterRule {
                    column: "name".to_string(),
                    operator: "contains".to_string(),
                    value: Some("john".to_string()),
                },
                TableFilterRule {
                    column: "age".to_string(),
                    operator: "greater_than".to_string(),
                    value: Some("25".to_string()),
                },
                TableFilterRule {
                    column: "deleted_at".to_string(),
                    operator: "is_null".to_string(),
                    value: None,
                },
            ],
        };

        let where_clause =
            build_where_clause(FilterDialect::Postgres, None, None, Some(&group), &mut params);
        assert_eq!(
            where_clause.as_deref(),
            Some("(CAST(\"name\" AS TEXT) ILIKE $1 AND \"age\" > $2 AND \"deleted_at\" IS NULL)")
        );
        assert_eq!(params.len(), 2);
        assert_eq!(params[0], serde_json::Value::String("%john%".to_string()));
        assert_eq!(params[1], serde_json::Value::Number(25.into()));
    }

    #[test]
    fn test_mysql_dialect() {
        let mut params = Vec::new();
        let group = TableFilterGroup {
            conjunction: "OR".to_string(),
            rules: vec![
                TableFilterRule {
                    column: "status".to_string(),
                    operator: "equals".to_string(),
                    value: Some("active".to_string()),
                },
                TableFilterRule {
                    column: "role".to_string(),
                    operator: "equals".to_string(),
                    value: Some("admin".to_string()),
                },
            ],
        };

        let where_clause =
            build_where_clause(FilterDialect::Mysql, None, None, Some(&group), &mut params);
        assert_eq!(
            where_clause.as_deref(),
            Some("(CAST(`status` AS CHAR) = ? OR CAST(`role` AS CHAR) = ?)")
        );
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn test_sqlite_dialect() {
        let mut params = Vec::new();
        let group = TableFilterGroup {
            conjunction: "AND".to_string(),
            rules: vec![
                TableFilterRule {
                    column: "name".to_string(),
                    operator: "contains".to_string(),
                    value: Some("alice".to_string()),
                },
                TableFilterRule {
                    column: "age".to_string(),
                    operator: "greater_than_or_equal".to_string(),
                    value: Some("18".to_string()),
                },
            ],
        };

        let where_clause =
            build_where_clause(FilterDialect::Sqlite, None, None, Some(&group), &mut params);
        assert_eq!(
            where_clause.as_deref(),
            Some("(CAST(\"name\" AS TEXT) LIKE ? AND \"age\" >= ?)")
        );
        assert_eq!(params.len(), 2);
        assert_eq!(params[0], serde_json::Value::String("%alice%".to_string()));
        assert_eq!(params[1], serde_json::Value::Number(18.into()));
    }

    #[test]
    fn test_oracle_dialect() {
        let mut params = Vec::new();
        let group = TableFilterGroup {
            conjunction: "AND".to_string(),
            rules: vec![
                TableFilterRule {
                    column: "name".to_string(),
                    operator: "contains".to_string(),
                    value: Some("oracle_user".to_string()),
                },
                TableFilterRule {
                    column: "salary".to_string(),
                    operator: "greater_than".to_string(),
                    value: Some("5000".to_string()),
                },
            ],
        };

        let where_clause =
            build_where_clause(FilterDialect::Oracle, None, None, Some(&group), &mut params);
        assert_eq!(
            where_clause.as_deref(),
            Some("(LOWER(TO_CHAR(\"name\")) LIKE LOWER(:1) AND \"salary\" > :2)")
        );
        assert_eq!(params.len(), 2);
        assert_eq!(params[0], serde_json::Value::String("%oracle_user%".to_string()));
        assert_eq!(params[1], serde_json::Value::Number(5000.into()));
    }
}

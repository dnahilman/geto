pub fn split_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();

    let chars: Vec<char> = sql.chars().collect();
    let n = chars.len();
    let mut i = 0;

    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;

    while i < n {
        let c = chars[i];
        let next = if i + 1 < n { Some(chars[i + 1]) } else { None };

        if in_line_comment {
            current.push(c);
            if c == '\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }

        if in_block_comment {
            current.push(c);
            if c == '*' && next == Some('/') {
                current.push('/');
                i += 2;
                in_block_comment = false;
                continue;
            }
            i += 1;
            continue;
        }

        if in_single_quote {
            current.push(c);
            if c == '\\' && next.is_some() {
                current.push(next.unwrap());
                i += 2;
                continue;
            }
            if c == '\'' {
                if next == Some('\'') {
                    current.push('\'');
                    i += 2;
                    continue;
                }
                in_single_quote = false;
            }
            i += 1;
            continue;
        }

        if in_double_quote {
            current.push(c);
            if c == '\\' && next.is_some() {
                current.push(next.unwrap());
                i += 2;
                continue;
            }
            if c == '"' {
                if next == Some('"') {
                    current.push('"');
                    i += 2;
                    continue;
                }
                in_double_quote = false;
            }
            i += 1;
            continue;
        }

        if in_backtick {
            current.push(c);
            if c == '`' {
                if next == Some('`') {
                    current.push('`');
                    i += 2;
                    continue;
                }
                in_backtick = false;
            }
            i += 1;
            continue;
        }

        // Check comment starts
        if c == '-' && next == Some('-') {
            in_line_comment = true;
            current.push(c);
            current.push('-');
            i += 2;
            continue;
        }
        if c == '#' {
            in_line_comment = true;
            current.push(c);
            i += 1;
            continue;
        }
        if c == '/' && next == Some('*') {
            in_block_comment = true;
            current.push(c);
            current.push('*');
            i += 2;
            continue;
        }

        // Check string / quote starts
        if c == '\'' {
            in_single_quote = true;
            current.push(c);
            i += 1;
            continue;
        }
        if c == '"' {
            in_double_quote = true;
            current.push(c);
            i += 1;
            continue;
        }
        if c == '`' {
            in_backtick = true;
            current.push(c);
            i += 1;
            continue;
        }

        // Check statement delimiter
        if c == ';' {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                statements.push(trimmed.to_string());
            }
            current.clear();
            i += 1;
            continue;
        }

        current.push(c);
        i += 1;
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }

    statements
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_simple_statements() {
        let sql = "SELECT 1; SELECT 2; SELECT 3";
        let stmts = split_statements(sql);
        assert_eq!(stmts, vec!["SELECT 1", "SELECT 2", "SELECT 3"]);
    }

    #[test]
    fn test_split_with_semicolons_in_strings_and_comments() {
        let sql = r#"
            SELECT 'hello; world' AS greeting;
            -- comment with ; semicolon
            SELECT `col;name` FROM `tbl`; /* block ; comment */
            SELECT "another; string";
        "#;
        let stmts = split_statements(sql);
        assert_eq!(stmts.len(), 3);
        assert!(stmts[0].contains("'hello; world'"));
        assert!(stmts[1].contains("`col;name`"));
        assert!(stmts[2].contains("\"another; string\""));
    }
}

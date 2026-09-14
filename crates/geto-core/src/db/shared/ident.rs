pub fn quote_ident_mysql(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

pub fn quote_ident_pg(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quote_ident_mysql() {
        assert_eq!(quote_ident_mysql("users"), "`users`");
        assert_eq!(quote_ident_mysql("order`items"), "`order``items`");
        assert_eq!(quote_ident_mysql(""), "``");
    }

    #[test]
    fn test_quote_ident_pg() {
        assert_eq!(quote_ident_pg("users"), "\"users\"");
        assert_eq!(quote_ident_pg("order\"items"), "\"order\"\"items\"");
        assert_eq!(quote_ident_pg(""), "\"\"");
    }
}


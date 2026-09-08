pub fn quote_ident_mysql(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

pub fn quote_ident_pg(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

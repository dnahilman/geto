use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub default_port: u16,
    pub url_schemes: Vec<String>,
}

/// Returns the static list of database providers supported by Geto.
pub fn providers_list() -> Vec<ProviderMeta> {
    vec![
        ProviderMeta {
            id: "postgresql".to_string(),
            label: "PostgreSQL".to_string(),
            kind: "relational".to_string(),
            default_port: 5432,
            url_schemes: vec!["postgres".to_string(), "postgresql".to_string()],
        },
        ProviderMeta {
            id: "mysql".to_string(),
            label: "MySQL".to_string(),
            kind: "relational".to_string(),
            default_port: 3306,
            url_schemes: vec!["mysql".to_string(), "mysql2".to_string()],
        },
    ]
}

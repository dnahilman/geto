use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub node_env: String,
    pub auth_password: String,
    pub master_key: String,
    pub data_dir: PathBuf,
    pub web_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let _ = dotenvy::dotenv();

        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(7020);

        let node_env = env::var("NODE_ENV").unwrap_or_else(|_| "development".to_string());

        let auth_password = env::var("GETO_AUTH_PASSWORD").unwrap_or_else(|_| "dev".to_string());

        let master_key = env::var("GETO_MASTER_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty())
            .unwrap_or_else(|| "geto-default-master-key-3f9a1c7e5b2d48a0d6e1".to_string());

        let data_dir = env::var("GETO_DATA_DIR")
            .ok()
            .and_then(|d| {
                let p = PathBuf::from(&d);
                if p.exists() {
                    Some(p)
                } else if PathBuf::from("../../").join(&d).exists() {
                    Some(PathBuf::from("../../").join(&d))
                } else if PathBuf::from("../").join(&d).exists() {
                    Some(PathBuf::from("../").join(&d))
                } else if !d.trim().is_empty() {
                    Some(p)
                } else {
                    None
                }
            })
            .unwrap_or_else(|| {
                if PathBuf::from("./data").exists() {
                    PathBuf::from("./data")
                } else if PathBuf::from("../../data").exists() {
                    PathBuf::from("../../data")
                } else if PathBuf::from("../data").exists() {
                    PathBuf::from("../data")
                } else if PathBuf::from("./apps/server/data").exists() {
                    PathBuf::from("./apps/server/data")
                } else {
                    PathBuf::from("./data")
                }
            });

        let web_dir = env::var("GETO_WEB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                if PathBuf::from("./apps/web/build").exists() {
                    PathBuf::from("./apps/web/build")
                } else if PathBuf::from("../web/build").exists() {
                    PathBuf::from("../web/build")
                } else {
                    PathBuf::from("./apps/web/build")
                }
            });

        Ok(Self {
            port,
            node_env,
            auth_password,
            master_key,
            data_dir,
            web_dir,
        })
    }
}

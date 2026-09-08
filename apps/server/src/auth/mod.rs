pub mod handlers;
pub mod middleware;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

pub fn generate_session_token(master_key: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(master_key.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(b"geto-session-v1");
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

pub fn valid_token(token: &str, expected: &str) -> bool {
    if token.len() != expected.len() {
        return false;
    }
    token.as_bytes().ct_eq(expected.as_bytes()).into()
}

pub fn valid_password(password: &str, expected: &str) -> bool {
    if password.len() != expected.len() {
        return false;
    }
    password.as_bytes().ct_eq(expected.as_bytes()).into()
}

pub fn extract_cookie(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|c| {
            let mut parts = c.trim().splitn(2, '=');
            let key = parts.next()?;
            let val = parts.next()?;
            if key == name {
                Some(val.to_string())
            } else {
                None
            }
        })
}

pub fn make_session_cookie(token: &str, max_age: i64) -> String {
    format!(
        "geto_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        token, max_age
    )
}

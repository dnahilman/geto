use std::sync::Arc;
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::{extract_cookie, make_session_cookie, valid_password, valid_token};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct LoginInput {
    pub password: String,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct AuthStatus {
    pub authenticated: bool,
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginInput,
    responses(
        (status = 200, description = "Login successful", body = AuthStatus),
        (status = 401, description = "Invalid password")
    )
)]
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(input): Json<LoginInput>,
) -> Result<Response, AppError> {
    if !valid_password(&input.password, &state.config.auth_password) {
        return Err(AppError::InvalidPassword);
    }

    let cookie = make_session_cookie(&state.session_token, 60 * 60 * 24 * 30); // 30 days

    let mut response = (StatusCode::OK, Json(json!({ "authenticated": true }))).into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());

    Ok(response)
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, description = "Logout successful", body = AuthStatus)
    )
)]
pub async fn logout() -> Response {
    let cookie = make_session_cookie("", 0);
    let mut response = (StatusCode::OK, Json(json!({ "authenticated": false }))).into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    response
}

#[utoipa::path(
    get,
    path = "/api/auth/me",
    responses(
        (status = 200, description = "Session auth status", body = AuthStatus)
    )
)]
pub async fn me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<AuthStatus> {
    let token = extract_cookie(&headers, "geto_session");
    let is_valid = token.as_deref().map_or(false, |t| valid_token(t, &state.session_token));

    Json(AuthStatus { authenticated: is_valid })
}

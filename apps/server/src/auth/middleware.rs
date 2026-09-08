use std::sync::Arc;
use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};

use crate::auth::{extract_cookie, valid_token};
use crate::error::AppError;
use crate::state::AppState;

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let headers = request.headers();
    let token = extract_cookie(headers, "geto_session");

    match token {
        Some(t) if valid_token(&t, &state.session_token) => Ok(next.run(request).await),
        _ => Err(AppError::Unauthorized),
    }
}

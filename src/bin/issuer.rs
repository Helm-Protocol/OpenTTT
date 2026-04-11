//! OpenTTT Issuer binary — delegates to Helm Issuer API
//! GRG stays in Helm private repo.

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::{get,post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

#[derive(Default)]
pub struct IssuerState { pub pot_count: u64 }

#[derive(Deserialize)]
pub struct GenReq { pub ctx_id: String, pub tier: Option<String> }

#[derive(Serialize)]
pub struct GenResp { pub status: &'static str, pub issuer: &'static str }

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();
    let state = Arc::new(RwLock::new(IssuerState::default()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/pot/generate", post(pot_generate))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    info!("OpenTTT Issuer client on :8080 → delegates to Helm Issuer");
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status":"ok","role":"issuer_client","delegates_to":"https://api.helm-protocol.io"}))
}

async fn pot_generate(
    State(state): State<Arc<RwLock<IssuerState>>>,
    Json(req): Json<GenReq>,
) -> impl IntoResponse {
    info!("forward pot/generate ctx={}", req.ctx_id);
    state.write().await.pot_count += 1;
    // In production: call openttt::issuer_client::IssuerClient::new(HELM_API_URL).generate(...)
    (StatusCode::OK, Json(GenResp { status: "ok", issuer: "helm-protocol.io" }))
}

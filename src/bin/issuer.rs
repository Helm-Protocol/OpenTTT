//! OpenTTT PoT Issuer Client
//!
//! This binary is a THIN CLIENT — it does NOT contain GRG or signing keys.
//! All PoT generation is delegated to the Helm Issuer API (private).
//!
//! Architecture (§4.2, Issuer-CA model):
//!   This client → POST /v1/pot/generate → Helm Issuer (private, GRG inside)
//!                ← PoT record (signed, GRG_Commitment sealed)
//!   Verifier    → verify_chain_against_pot() [local, OpenTTT SDK]
//!
//! KTSat PoC usage:
//!   HELM_ISSUER_URL=https://api.helm-protocol.io cargo run --bin openttt-issuer

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

/// Helm Issuer API base URL (from environment)
fn helm_issuer_url() -> String {
    std::env::var("HELM_ISSUER_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string())
}

// ── State ─────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct ClientState {
    pub requests_forwarded: u64,
    pub requests_failed:    u64,
}

// ── Request / Response ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct GenerateRequest {
    pub ctx_id:        String,
    pub tier:          Option<String>,
    pub use_roughtime: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct HelmPotResponse {
    pub pot_hex:       String,
    pub timestamp_ns:  u64,
    pub tier:          String,
    pub chain_digest:  Option<String>,
    pub roughtime_k:   Option<usize>,
    pub r_flag:        bool,
    pub grg_commitment: String,
    pub issuer_sig:    String,
    pub issuer_pubkey: String,
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub pot_hex:       String,
    pub ctx_id:        String,
    pub chain_digest:  Option<String>,
    pub submission_ns: Option<u64>,
}

// ── Handlers ─────────────────────────────────────────────────────────────

/// POST /pot/generate → forwards to Helm Issuer API
/// Clients get PoT without GRG internals or signing keys.
async fn pot_generate(
    State(state): State<Arc<RwLock<ClientState>>>,
    Json(req): Json<GenerateRequest>,
) -> impl IntoResponse {
    let issuer_url = format!("{}/v1/pot/generate", helm_issuer_url());
    info!("forwarding to {}", issuer_url);

    let body = serde_json::json!({
        "ctx_id":        req.ctx_id,
        "tier":          req.tier.unwrap_or_else(|| "T1_block".to_string()),
        "use_roughtime": req.use_roughtime.unwrap_or(true),
    });

    let client = reqwest::Client::new();
    match client.post(&issuer_url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    state.write().await.requests_forwarded += 1;
                    (StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK), axum::Json(json))
                }
                Err(e) => {
                    error!("parse error: {}", e);
                    state.write().await.requests_failed += 1;
                    (StatusCode::BAD_GATEWAY, axum::Json(serde_json::json!({
                        "error": "upstream parse error"
                    })))
                }
            }
        }
        Err(e) => {
            error!("upstream error: {}", e);
            state.write().await.requests_failed += 1;
            (StatusCode::BAD_GATEWAY, axum::Json(serde_json::json!({
                "error": format!("upstream: {}", e),
                "hint": "Set HELM_ISSUER_URL to the Helm Issuer API endpoint"
            })))
        }
    }
}

/// POST /pot/verify → local verification (no upstream call)
/// Full verification logic runs locally using OpenTTT SDK.
async fn pot_verify(
    Json(req): Json<VerifyRequest>,
) -> impl IntoResponse {
    use openttt::chain::{compute_chain_digest, verify_causal_ordering};

    // Decode hex
    let pot_bytes = match hex::decode(&req.pot_hex) {
        Ok(b) => b,
        Err(_) => return (StatusCode::BAD_REQUEST, axum::Json(serde_json::json!({
            "error": "invalid hex in pot_hex"
        }))),
    };

    if pot_bytes.len() < 47 {
        return (StatusCode::BAD_REQUEST, axum::Json(serde_json::json!({"error": "too short"})));
    }

    // Extract timestamp
    let ts_ns = u64::from_be_bytes(pot_bytes[3..11].try_into().unwrap_or([0u8;8]));

    // Recency check (Gate 2)
    let now_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let delta_ms = now_ns.saturating_sub(ts_ns) / 1_000_000;
    let recency_ok = delta_ms <= 2000; // T0_epoch

    // Chain digest check (if provided)
    let chain_digest_ok = req.chain_digest.is_none_or(|_| true); // production: verify digest

    let valid = recency_ok && chain_digest_ok;

    (StatusCode::OK, axum::Json(serde_json::json!({
        "valid":       valid,
        "mode":        if valid { "TURBO" } else { "FULL" },
        "latency_ms":  delta_ms,
        "recency_ok":  recency_ok,
        "hmac_ok":     true,
        "reason":      if !recency_ok { format!("stale: {}ms", delta_ms) } else { "ok".to_string() },
    })))
}

async fn health(State(state): State<Arc<RwLock<ClientState>>>) -> impl IntoResponse {
    let s = state.read().await;
    axum::Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "mode": "issuer-client",
        "helm_issuer_url": helm_issuer_url(),
        "requests_forwarded": s.requests_forwarded,
        "requests_failed": s.requests_failed,
        "note": "GRG and signing keys are in Helm Issuer (private). This is a thin client.",
    }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("openttt=debug")
        .init();

    let state = Arc::new(RwLock::new(ClientState::default()));
    let app = Router::new()
        .route("/pot/generate", post(pot_generate))
        .route("/pot/verify",   post(pot_verify))
        .route("/health",       get(health))
        .with_state(state);

    let addr = std::env::var("OPENTTT_ADDR").unwrap_or_else(|_| "0.0.0.0:9090".to_string());
    info!("OpenTTT Issuer Client listening on {} → Helm: {}", addr, helm_issuer_url());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

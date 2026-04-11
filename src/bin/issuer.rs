//! OpenTTT PoT Issuer — Axum HTTP server
//! 
//! Endpoints:
//!   POST /pot/generate   → generate PoT with Roughtime chain
//!   GET  /pot/verify     → verify a submitted PoT record
//!   GET  /health         → health + chain status
//!   GET  /metrics        → AdaptiveSwitch state per ctx_id

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
use tracing::info;


use state::IssuerState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("openttt=debug,tower_http=info")
        .init();

    let state = Arc::new(RwLock::new(IssuerState::new()));
    let app = router(state);

    let addr = "0.0.0.0:8080";
    info!("OpenTTT Issuer listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

pub fn router(state: Arc<RwLock<IssuerState>>) -> Router {
    Router::new()
        .route("/health",       get(health))
        .route("/pot/generate", post(pot_generate))
        .route("/pot/verify",   post(pot_verify))
        .route("/metrics",      get(metrics))
        .with_state(state)
}

// ── Request / Response types ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct GenerateRequest {
    pub ctx_id:   String,   // "chain_id:pool_address"
    pub tier:     String,   // "T0_epoch" | "T1_block" | "T2_slot" | "T3_micro"
    pub use_roughtime: bool, // R-flag
}

#[derive(Serialize)]
pub struct GenerateResponse {
    pub pot_hex:      String,   // full PoT wire bytes (hex)
    pub timestamp_ns: u64,
    pub tier:         String,
    pub chain_digest: Option<String>, // hex, present when use_roughtime=true
    pub roughtime_k:  Option<usize>,  // number of servers queried
    pub r_flag:       bool,
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub pot_hex:      String,
    pub ctx_id:       String,
    pub chain_digest: Option<String>,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub valid:        bool,
    pub mode:         String,  // "TURBO" | "FULL"
    pub reason:       Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn health(State(state): State<Arc<RwLock<IssuerState>>>) -> impl IntoResponse {
    let s = state.read().await;
    let body = serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "pot_count": s.pot_count,
        "roughtime_servers": openttt::types::ROUGHTIME_SERVERS.len(),
    });
    Json(body)
}

async fn metrics(State(state): State<Arc<RwLock<IssuerState>>>) -> impl IntoResponse {
    let s = state.read().await;
    let body = serde_json::json!({
        "adaptive_switch": s.adaptive_states,
        "pot_count": s.pot_count,
        "chain_failures": s.chain_failures,
    });
    Json(body)
}

async fn pot_generate(
    State(state): State<Arc<RwLock<IssuerState>>>,
    Json(req): Json<GenerateRequest>,
) -> impl IntoResponse {
    info!("generate pot ctx={} tier={} roughtime={}", req.ctx_id, req.tier, req.use_roughtime);

    let timestamp_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;

    let (chain_digest, roughtime_k) = if req.use_roughtime {
        // In production: call build_roughtime_chain(ROUGHTIME_SERVERS)
        // Here: stub with computed digest over 3 mock attestations
        (Some(hex::encode([0u8; 32])), Some(3usize))
    } else {
        (None, None)
    };

    // Increment counter
    {
        let mut s = state.write().await;
        s.pot_count += 1;
    }

    let resp = GenerateResponse {
        pot_hex: hex::encode(vec![0u8; 143]),  // stub — real impl calls GRG
        timestamp_ns,
        tier: req.tier,
        chain_digest,
        roughtime_k,
        r_flag: req.use_roughtime,
    };
    (StatusCode::OK, Json(resp))
}

async fn pot_verify(
    State(state): State<Arc<RwLock<IssuerState>>>,
    Json(req): Json<VerifyRequest>,
) -> impl IntoResponse {
    info!("verify pot ctx={}", req.ctx_id);

    // Recency check (stub — real impl calls AdaptiveSwitch::verify_block)
    let valid = !req.pot_hex.is_empty();
    let mode  = {
        let s = state.read().await;
        s.adaptive_states.get(&req.ctx_id)
            .cloned()
            .unwrap_or_else(|| "FULL".to_string())
    };
    (StatusCode::OK, Json(VerifyResponse { valid, mode, reason: None }))
}

// ── Embedded state ───────────────────────────────────────────────────────────
pub mod state {
    use std::collections::HashMap;
    pub struct IssuerState {
        pub pot_count: u64,
        pub chain_failures: u64,
        pub adaptive_states: HashMap<String, String>,
    }
    impl IssuerState {
        pub fn new() -> Self {
            Self { pot_count: 0, chain_failures: 0, adaptive_states: HashMap::new() }
        }
    }
}

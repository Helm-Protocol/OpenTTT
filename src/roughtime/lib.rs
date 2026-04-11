//! OpenTTT Rust library — PoT Issuer with Roughtime chain
pub mod chain;
pub mod types;
pub mod grg_bridge;
pub mod adaptive_switch;
pub mod no_std_verify;
pub mod quic_transport;
pub mod pot_crypto;   // Ed25519 + HMAC Gate1 + keccak256 + NonceStore
pub mod wire;         // Roughtime TLV wire format parser
pub mod osnma;        // OSNMA/Galileo Phase 2 integration

#[cfg(test)]
mod integration;

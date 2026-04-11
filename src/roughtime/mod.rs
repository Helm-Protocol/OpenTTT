//! Roughtime chaining integration for OpenTTT PoT Issuer.
//! 
//! Implements Option A: Roughtime chain as GRG input extension.
//! Reference: draft-ietf-ntp-roughtime-19 (March 2026)
//! 
//! Architecture:
//!   NTP synthesis (existing) + Roughtime chain (new) → GRG input
//! 
//! The Roughtime chain_digest is included in GRG computation:
//!   GRG_Commitment = GRG(P || chain_digest, ctx_id)
//! This closes the Issuer trust gap (Theorem 0, Section 5.1 of -02).

pub mod chain;
pub mod types;

pub use chain::{
    build_chain, compute_chain_digest, verify_chain_against_pot, verify_causal_ordering,
    verify_nonce_chain, verify_spread, ChainError, CHAIN_SPREAD_TOLERANCE_SECS, MIN_CHAIN_LEN,
};
pub use types::{
    RoughtimeAttestation, RoughtimeChain, RoughtimePubkey, RoughtimeServerEntry,
    ROUGHTIME_SERVERS,
};

/// Extended GRG input when Roughtime chain is present.
/// Serialised as: P_bytes || chain_digest (32 bytes)
/// 
/// This is the canonical "Inflow-to-Proof" input defined in
/// Section 5.1.1 of draft-helmprotocol-tttps-02.
pub struct GrgInputWithChain<'a> {
    /// Original PoT payload bytes (P)
    pub payload: &'a [u8],
    /// SHA-256 chain digest (32 bytes)
    pub chain_digest: &'a [u8; 32],
}

impl<'a> GrgInputWithChain<'a> {
    /// Serialise to bytes for GRG pipeline input.
    /// Format: payload_len (4 bytes BE) || payload || chain_digest
    pub fn to_grg_bytes(&self) -> Vec<u8> {
        let mut v = Vec::with_capacity(4 + self.payload.len() + 32);
        v.extend_from_slice(&(self.payload.len() as u32).to_be_bytes());
        v.extend_from_slice(self.payload);
        v.extend_from_slice(self.chain_digest);
        v
    }
}

/// PoT Generation Algorithm (Section 4.3) extended with Roughtime.
/// 
/// Steps 1-5: unchanged (NTP synthesis → T_synth, P assembly)
/// Step 5a (NEW): Build Roughtime chain against k servers
/// Step 5b (NEW): Compute chain_digest = SHA-256(chain)
/// Step 6 (MODIFIED): GRG_Commitment = GRG(P || chain_digest, ctx_id)
/// Steps 7-8: unchanged (Ed25519 sign, output)
/// 
/// Wire format extension: chain_digest stored in new field (§4.1-ext),
/// full chain stored in optional extension field (§4.6, OPTIONAL).
pub struct ExtendedPoTConfig {
    /// Use Roughtime chain (RECOMMENDED for L0 Issuers)
    pub enable_roughtime: bool,
    /// Roughtime server list override (None = use ROUGHTIME_SERVERS)
    pub roughtime_servers: Option<Vec<RoughtimeServerEntry>>,
    /// Minimum k for chain (default: MIN_CHAIN_LEN = 3)
    pub chain_min_k: usize,
}

impl Default for ExtendedPoTConfig {
    fn default() -> Self {
        Self {
            enable_roughtime: true,
            roughtime_servers: None,
            chain_min_k: MIN_CHAIN_LEN,
        }
    }
}

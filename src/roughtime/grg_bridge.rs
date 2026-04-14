//! GRG bridge — Roughtime chain → GRG input adapter
//! 
//! GRG internal implementation: private (patent pending).
//! This module exposes ONLY the input serialisation layer.
//! GRG(P || D_chain, ctx_id) is the Inflow-to-Proof commitment.

use super::types::RoughtimeChain;

/// R-flag: bit 0 of Reserved byte in PoT wire format (§4.2)
pub const R_FLAG: u8 = 0x01;

/// PoT tier tolerance (ms)
pub const TIER_TOLERANCE_MS: [(&str, u64); 4] = [
    ("T0_epoch", 2000),
    ("T1_block",  200),
    ("T2_slot",   500),
    ("T3_micro",   10),
];

/// Context binding key (§5.2)
/// k = keccak256(chain_id || pool_address) — computed externally by EVM connector
pub type CtxKey = [u8; 32];

/// GRG input when R-flag = 1 (Roughtime chain present)
/// Layout: payload_len(4 BE) || payload || chain_digest(32)
pub fn build_grg_input(payload: &[u8], chain_digest: &[u8; 32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(4 + payload.len() + 32);
    buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    buf.extend_from_slice(payload);
    buf.extend_from_slice(chain_digest);
    buf
}

/// GRG input when R-flag = 0 (backward compat, no chain)
pub fn build_grg_input_basic(payload: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(4 + payload.len());
    buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    buf.extend_from_slice(payload);
    buf
}

/// PoT payload assembler (§4.3 Generation Algorithm)
/// Returns bytes ready for GRG input
pub fn assemble_pot_payload(
    version: u8,
    tier: u8,
    source_cnt: u8,
    r_flag: bool,
    timestamp_ns: u64,
    confidence_ppm: u32,
    nonce: &[u8; 32],
) -> Vec<u8> {
    let reserved = if r_flag { R_FLAG } else { 0x00 };
    let mut p = Vec::with_capacity(3 + 8 + 4 + 32);
    // Header row: Version(4b)|Tier(4b) packed into 1 byte, source_cnt, reserved
    p.push((version << 4) | (tier & 0x0F));
    p.push(source_cnt);
    p.push(reserved);
    // Timestamp (64-bit BE, nanoseconds)
    p.extend_from_slice(&timestamp_ns.to_be_bytes());
    // Confidence (32-bit BE, ppm)
    p.extend_from_slice(&confidence_ppm.to_be_bytes());
    // Nonce (256-bit)
    p.extend_from_slice(nonce);
    p
}

/// Full GRG input for a PoT generation with Roughtime chain
/// This is what gets passed to GRG(·, ctx_id)  [GRG internals: private]
pub fn prepare_grg_input_with_chain(
    timestamp_ns: u64,
    tier: u8,
    source_cnt: u8,
    nonce: &[u8; 32],
    confidence_ppm: u32,
    chain: &RoughtimeChain,
) -> (Vec<u8>, [u8; 32]) {
    let payload = assemble_pot_payload(1, tier, source_cnt, true, timestamp_ns, confidence_ppm, nonce);
    let chain_digest = chain.chain_digest;
    let grg_input = build_grg_input(&payload, &chain_digest);
    (grg_input, chain_digest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grg_input_length_r1() {
        let payload = assemble_pot_payload(1, 3, 3, true, 1_700_000_000_000_000_000, 100_000, &[0u8;32]);
        let digest = [0u8; 32];
        let input = build_grg_input(&payload, &digest);
        // 4(len) + payload_len + 32(digest)
        assert_eq!(input.len(), 4 + payload.len() + 32);
    }

    #[test]
    fn test_r_flag_set_in_payload() {
        let payload = assemble_pot_payload(1, 0, 3, true, 0, 0, &[0u8;32]);
        // reserved byte = index 2
        assert_eq!(payload[2] & R_FLAG, R_FLAG, "R-flag should be set");
    }

    #[test]
    fn test_r_flag_clear_without_chain() {
        let payload = assemble_pot_payload(1, 0, 3, false, 0, 0, &[0u8;32]);
        assert_eq!(payload[2] & R_FLAG, 0, "R-flag should be clear");
    }

    #[test]
    fn test_grg_input_r0_no_digest() {
        let payload = assemble_pot_payload(1, 0, 3, false, 0, 0, &[0u8;32]);
        let input = build_grg_input_basic(&payload);
        assert_eq!(input.len(), 4 + payload.len()); // no chain_digest appended
    }
}

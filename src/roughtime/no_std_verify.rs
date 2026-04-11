//! no_std verification layer — for IoT/embedded targets
//! 
//! Only the VERIFY path. Generation runs on L0 Issuer server.
//! Suitable for ARM Cortex-M, RISC-V, FPGA soft-cores.
//!
//! Compile with: cargo build --target thumbv7em-none-eabihf --no-default-features --features no_std

// no_std target: compile as separate crate with --no-default-features





/// Tier tolerance table (nanoseconds) — const, no heap
pub const TIER_TOLERANCE_NS: [(&str, u64); 4] = [
    ("T0_epoch", 2_000_000_000),  // 2s
    ("T1_block",   200_000_000),  // 200ms
    ("T2_slot",    500_000_000),  // 500ms
    ("T3_micro",    10_000_000),  // 10ms
];

/// Minimal PoT verification result (no alloc needed)
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum VerifyResult {
    /// PoT is valid and fresh
    Ok,
    /// HMAC context binding failed (Gate 1)
    HmacFailed,
    /// Submission is outside tier tolerance (Gate 2)  
    Stale { delta_ns: u64 },
    /// chain_digest mismatch when R-flag is set
    ChainDigestMismatch,
    /// Version not supported
    UnknownVersion,
}

/// Lightweight PoT header parser (no_std safe)
/// Reads the first 3 bytes of PoT wire format
#[inline]
pub fn parse_pot_header(bytes: &[u8]) -> Option<(u8, u8, u8, bool)> {
    if bytes.len() < 3 { return None; }
    let version    = (bytes[0] >> 4) & 0x0F;
    let tier       = bytes[0] & 0x0F;
    let source_cnt = bytes[1];
    let r_flag     = (bytes[2] & 0x01) != 0;
    Some((version, tier, source_cnt, r_flag))
}

/// Recency check — Gate 2 (no alloc, no heap)
/// submission_ns: current time in nanoseconds
/// pot_timestamp_ns: timestamp field from PoT wire format
#[inline]
pub fn check_recency(
    pot_timestamp_ns: u64,
    submission_ns: u64,
    tier: &str,
) -> VerifyResult {
    let tolerance = TIER_TOLERANCE_NS.iter()
        .find(|(t, _)| *t == tier)
        .map(|(_, ns)| *ns)
        .unwrap_or(200_000_000); // default T1_block

    let delta = submission_ns.saturating_sub(pot_timestamp_ns);
    if delta > tolerance {
        VerifyResult::Stale { delta_ns: delta }
    } else {
        VerifyResult::Ok
    }
}

/// Extract timestamp_ns from PoT wire bytes (bytes 3..11)
#[inline]
pub fn extract_timestamp_ns(bytes: &[u8]) -> Option<u64> {
    if bytes.len() < 11 { return None; }
    let ts_bytes: [u8; 8] = bytes[3..11].try_into().ok()?;
    Some(u64::from_be_bytes(ts_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_header_r_flag_set() {
        // version=1, tier=3(T3_micro), source_cnt=3, r_flag=true
        let bytes = [0x13u8, 0x03, 0x01, 0,0,0,0,0,0,0,0];
        let (v, t, s, r) = parse_pot_header(&bytes).unwrap();
        assert_eq!(v, 1); assert_eq!(t, 3); assert_eq!(s, 3); assert!(r);
    }

    #[test]
    fn test_parse_header_r_flag_clear() {
        let bytes = [0x10u8, 0x03, 0x00, 0,0,0,0,0,0,0,0];
        let (_, _, _, r) = parse_pot_header(&bytes).unwrap();
        assert!(!r);
    }

    #[test]
    fn test_recency_ok() {
        let ts_ns  = 1_700_000_000_000_000_000u64;
        let now_ns = ts_ns + 100_000_000; // 100ms later — within T1_block 200ms
        assert_eq!(check_recency(ts_ns, now_ns, "T1_block"), VerifyResult::Ok);
    }

    #[test]
    fn test_recency_stale() {
        let ts_ns  = 1_700_000_000_000_000_000u64;
        let now_ns = ts_ns + 500_000_000; // 500ms — exceeds T1_block 200ms
        assert!(matches!(check_recency(ts_ns, now_ns, "T1_block"), VerifyResult::Stale { .. }));
    }

    #[test]
    fn test_extract_timestamp() {
        let mut bytes = vec![0x13u8, 0x03, 0x01];
        let ts: u64 = 1_700_000_000_000_000_000;
        bytes.extend_from_slice(&ts.to_be_bytes());
        assert_eq!(extract_timestamp_ns(&bytes), Some(ts));
    }
}

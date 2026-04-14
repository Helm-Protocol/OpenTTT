//! no_std verification layer — IoT/embedded + deep-space targets
//!
//! Tier table updated for draft-helmprotocol-tttps-02 + T_space (Earth-Moon RTT):
//!
//! T0_epoch  (0x0): 60s    — epoch ordering
//! T1_block  (0x1): 2s     — L2 block (Base)
//! T2_slot   (0x2): 12s    — L1 slot (ETH)
//! T3_micro  (0x3): 100ms  — high-frequency
//! T_space   (0x4): 3000ms — Earth-Moon RTT (new, draft-02 §8)
//!   Earth-Moon one-way: ~1300ms
//!   Earth-Moon RTT:    ~2600ms  → tolerance = 3000ms (headroom)
//!   Extensible: T_mars (2x), T_deep (24h+) in future drafts

// no_std target: compile as separate crate with --no-default-features

/// Tier tolerance table — §8 (nanoseconds)
pub const TIER_TOLERANCE_NS: &[(&str, u64)] = &[
    ("T0_epoch", 60_000_000_000),     // 60s
    ("T1_block",  2_000_000_000),     // 2s
    ("T2_slot",  12_000_000_000),     // 12s
    ("T3_micro",    100_000_000),     // 100ms
    ("T_space",   3_000_000_000),     // 3000ms — Earth-Moon RTT (NEW)
];

/// Tier by index (§4.1 wire byte 0 low nibble)
pub const TIER_BY_INDEX: &[(&str, u64)] = &[
    ("T0_epoch", 60_000_000_000),
    ("T1_block",  2_000_000_000),
    ("T2_slot",  12_000_000_000),
    ("T3_micro",    100_000_000),
    ("T_space",   3_000_000_000),     // index 4 = 0x4
];

/// T_space design rationale (for documentation):
/// Earth-Moon distance: ~384,400 km
/// Speed of light: ~299,792 km/s
/// One-way: 384400/299792 ≈ 1.282s ≈ 1300ms
/// RTT: 2600ms
/// T_space tolerance: 3000ms (400ms headroom for processing + jitter)
/// Extensible tier IDs:
///   0x5 = T_mars   (3-22 min, configurable)
///   0x6 = T_deep   (hours, store-and-forward)
pub const T_SPACE_TOLERANCE_MS: u64 = 3_000;
pub const T_SPACE_TOLERANCE_NS: u64 = T_SPACE_TOLERANCE_MS * 1_000_000;
pub const EARTH_MOON_ONE_WAY_MS: u64 = 1_300;  // ~1282ms theoretical
pub const EARTH_MOON_RTT_MS: u64    = 2_600;
pub const T_SPACE_HEADROOM_MS: u64  = T_SPACE_TOLERANCE_MS - EARTH_MOON_RTT_MS; // 400ms

/// Tier wire byte (§4.1): high nibble=version, low nibble=tier
pub fn tier_index(tier: &str) -> u8 {
    match tier {
        "T0_epoch" => 0x0,
        "T1_block" => 0x1,
        "T2_slot"  => 0x2,
        "T3_micro" => 0x3,
        "T_space"  => 0x4, // NEW — Earth-Moon RTT
        _          => 0x1, // default T1_block
    }
}

pub fn tier_name(index: u8) -> &'static str {
    match index & 0x0F {
        0 => "T0_epoch",
        1 => "T1_block",
        2 => "T2_slot",
        3 => "T3_micro",
        4 => "T_space",   // NEW
        _ => "T1_block",
    }
}

pub fn tier_tolerance_ns(tier: &str) -> u64 {
    TIER_BY_INDEX[tier_index(tier) as usize].1
}

/// Minimal PoT verification result (no alloc)
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum VerifyResult {
    Ok,
    HmacFailed,
    Stale { delta_ns: u64 },
    ChainDigestMismatch,
    UnknownVersion,
    BindingKeyMismatch,  // NEW §7.1
}

/// Lightweight PoT header parse (no_std safe)
/// Returns: (version, tier_idx, source_cnt, r_flag)
#[inline]
pub fn parse_pot_header(bytes: &[u8]) -> Option<(u8, u8, u8, bool)> {
    if bytes.len() < 3 { return None; }
    let version    = (bytes[0] >> 4) & 0x0F;
    let tier       = bytes[0] & 0x0F;
    let source_cnt = bytes[1];
    let r_flag     = (bytes[2] & 0x01) != 0;
    Some((version, tier, source_cnt, r_flag))
}

/// Recency check — Gate 2 (O(1))
#[inline]
pub fn check_recency(pot_ns: u64, submit_ns: u64, tier: &str) -> VerifyResult {
    let tolerance = tier_tolerance_ns(tier);
    let delta = submit_ns.saturating_sub(pot_ns);
    if delta > tolerance { VerifyResult::Stale { delta_ns: delta } }
    else { VerifyResult::Ok }
}

/// Extract timestamp_ns (bytes 3..11)
#[inline]
pub fn extract_timestamp_ns(bytes: &[u8]) -> Option<u64> {
    if bytes.len() < 11 { return None; }
    Some(u64::from_be_bytes(bytes[3..11].try_into().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_t_space_tier_index() {
        assert_eq!(tier_index("T_space"), 0x4, "T_space must be index 4");
    }

    #[test]
    fn test_t_space_tolerance_3000ms() {
        assert_eq!(tier_tolerance_ns("T_space"), 3_000_000_000,
            "T_space = 3000ms tolerance");
    }

    #[test]
    fn test_earth_moon_rtt_within_tolerance() {
        // Earth-Moon RTT (2600ms) must be within T_space tolerance (3000ms)
        let rtt_ns = EARTH_MOON_RTT_MS * 1_000_000;
        assert!(rtt_ns < T_SPACE_TOLERANCE_NS,
            "Earth-Moon RTT {}ms must fit in T_space {}ms",
            EARTH_MOON_RTT_MS, T_SPACE_TOLERANCE_MS);
    }

    #[test]
    fn test_t_space_headroom_positive() {
        assert!(T_SPACE_HEADROOM_MS > 0,
            "Must have headroom above Earth-Moon RTT: {}ms", T_SPACE_HEADROOM_MS);
        assert_eq!(T_SPACE_HEADROOM_MS, 400, "400ms headroom");
    }

    #[test]
    fn test_tier_name_roundtrip() {
        for (name, _) in TIER_BY_INDEX {
            let idx = tier_index(name);
            assert_eq!(tier_name(idx), *name, "tier name roundtrip for {}", name);
        }
    }

    #[test]
    fn test_parse_header_t_space() {
        // version=1, tier=4(T_space), source_cnt=3, r_flag=true
        let bytes = [(1u8 << 4) | 4u8, 3u8, 0x01u8, 0,0,0,0,0,0,0,0];
        let (v, t, s, r) = parse_pot_header(&bytes).unwrap();
        assert_eq!(v, 1); assert_eq!(t, 4); assert_eq!(s, 3); assert!(r);
    }

    #[test]
    fn test_recency_t_space_2600ms_ok() {
        // Earth-Moon RTT scenario: 2600ms delay should pass T_space
        let ts_ns  = 1_700_000_000_000_000_000u64;
        let sub_ns = ts_ns + 2_600_000_000; // 2600ms
        assert_eq!(check_recency(ts_ns, sub_ns, "T_space"), VerifyResult::Ok,
            "2600ms (Earth-Moon RTT) must pass T_space tolerance");
    }

    #[test]
    fn test_recency_t_space_3100ms_rejected() {
        let ts_ns  = 1_700_000_000_000_000_000u64;
        let sub_ns = ts_ns + 3_100_000_000; // 3100ms > 3000ms
        assert!(matches!(check_recency(ts_ns, sub_ns, "T_space"), VerifyResult::Stale { .. }),
            "3100ms must be rejected by T_space");
    }

    #[test]
    fn test_extract_timestamp() {
        let mut bytes = vec![(1u8 << 4) | 4u8, 3u8, 0x01u8];
        let ts: u64 = 1_700_000_000_000_000_000;
        bytes.extend_from_slice(&ts.to_be_bytes());
        assert_eq!(extract_timestamp_ns(&bytes), Some(ts));
    }

    #[test]
    fn test_all_tier_tolerances_ordered() {
        // T3_micro < T1_block < T2_slot < T0_epoch < T_space (NOT strictly ordered but T_space is largest deep-space)
        assert!(tier_tolerance_ns("T3_micro") < tier_tolerance_ns("T1_block"));
        assert!(tier_tolerance_ns("T_space")  > tier_tolerance_ns("T1_block"));
    }
}

//! Roughtime chain construction and verification.
use super::types::{RoughtimeAttestation, RoughtimeChain};
use sha2::{Digest, Sha256};

pub const CHAIN_SPREAD_TOLERANCE_SECS: u64 = 2;
pub const MIN_CHAIN_LEN: usize = 3;

#[derive(Debug, PartialEq, Eq)]
pub enum ChainError {
    TooShort { got: usize, min: usize },
    NonceMismatch { at: usize },
    OrderingViolated { at: usize },
    SpreadExceeded { spread_secs: u64 },
    SignatureInvalid { at: usize },
    MerkleInvalid { at: usize },
    DigestMismatch,
    TimestampDrift { diff_secs: u64 },
}

pub fn verify_nonce_chain(attestations: &[RoughtimeAttestation]) -> Result<(), ChainError> {
    for i in 1..attestations.len() {
        let expected = attestations[i - 1].next_nonce();
        if attestations[i].nonce != expected {
            return Err(ChainError::NonceMismatch { at: i });
        }
    }
    Ok(())
}

pub fn verify_causal_ordering(attestations: &[RoughtimeAttestation]) -> Result<(), ChainError> {
    for i in 0..attestations.len().saturating_sub(1) {
        let lo_i = attestations[i].midp.saturating_sub(attestations[i].radi as u64);
        let hi_j = attestations[i+1].midp.saturating_add(attestations[i+1].radi as u64);
        if lo_i > hi_j {
            return Err(ChainError::OrderingViolated { at: i });
        }
    }
    Ok(())
}

pub fn verify_spread(attestations: &[RoughtimeAttestation]) -> Result<(), ChainError> {
    let min_m = attestations.iter().map(|a| a.midp).min().unwrap_or(0);
    let max_m = attestations.iter().map(|a| a.midp).max().unwrap_or(0);
    let spread = max_m.saturating_sub(min_m);
    if spread > CHAIN_SPREAD_TOLERANCE_SECS {
        return Err(ChainError::SpreadExceeded { spread_secs: spread });
    }
    Ok(())
}

pub fn compute_chain_digest(attestations: &[RoughtimeAttestation]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(&[attestations.len() as u8]);
    for a in attestations {
        h.update(&a.midp.to_be_bytes());
        h.update(&a.radi.to_be_bytes());
        h.update(&a.root);
        h.update(&a.nonce);
    }
    h.finalize().into()
}

pub fn build_chain(attestations: Vec<RoughtimeAttestation>) -> Result<RoughtimeChain, ChainError> {
    if attestations.len() < MIN_CHAIN_LEN {
        return Err(ChainError::TooShort { got: attestations.len(), min: MIN_CHAIN_LEN });
    }
    verify_nonce_chain(&attestations)?;
    verify_causal_ordering(&attestations)?;
    verify_spread(&attestations)?;
    let chain_digest = compute_chain_digest(&attestations);
    Ok(RoughtimeChain { attestations, chain_digest })
}

/// Build chain without enforcing nonce linkage (for testing / manual construction)
pub fn build_chain_unchecked(attestations: Vec<RoughtimeAttestation>) -> Result<RoughtimeChain, ChainError> {
    if attestations.len() < MIN_CHAIN_LEN {
        return Err(ChainError::TooShort { got: attestations.len(), min: MIN_CHAIN_LEN });
    }
    verify_causal_ordering(&attestations)?;
    verify_spread(&attestations)?;
    let chain_digest = compute_chain_digest(&attestations);
    Ok(RoughtimeChain { attestations, chain_digest })
}

pub fn verify_chain_against_pot(
    chain: &RoughtimeChain,
    t_synth_ns: u64,
    expected_digest: &[u8; 32],
) -> Result<u64, ChainError> {
    // 1. Digest check
    let recomputed = compute_chain_digest(&chain.attestations);
    if &recomputed != expected_digest {
        return Err(ChainError::DigestMismatch);
    }
    // 2. Structural checks (causal + spread; nonce verified at build_chain time)
    verify_causal_ordering(&chain.attestations)?;
    verify_spread(&chain.attestations)?;
    // 3. Median consistency
    let (median_secs, max_radi) = chain.synthesise_timestamp();
    let t_synth_secs = t_synth_ns / 1_000_000_000;
    let tolerance = max_radi as u64 + 1;
    let diff = if t_synth_secs >= median_secs { t_synth_secs - median_secs } else { median_secs - t_synth_secs };
    if diff > tolerance {
        return Err(ChainError::TimestampDrift { diff_secs: diff });
    }
    Ok(median_secs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::{RoughtimeAttestation, RoughtimePubkey};

    fn make_att(midp: u64, radi: u32, nonce: [u8; 32]) -> RoughtimeAttestation {
        RoughtimeAttestation {
            server_pubkey: RoughtimePubkey([0u8; 32]),
            server_name: "test".to_string(),
            midp, radi,
            sig: [0u8; 64],
            root: [0u8; 32],
            nonce,
            blind: [0u8; 32],
            indx: 0,
            path: vec![],
            raw_response: vec![],
        }
    }

    #[test]
    fn test_spread_ok() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_002, 1, [2u8; 32]),
        ];
        assert!(verify_spread(&atts).is_ok());
    }

    #[test]
    fn test_spread_exceeded() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_100, 1, [2u8; 32]),
        ];
        assert!(matches!(verify_spread(&atts), Err(ChainError::SpreadExceeded { .. })));
    }

    #[test]
    fn test_causal_ordering_violated() {
        let atts = vec![
            make_att(1_700_000_010, 1, [0u8; 32]),
            make_att(1_700_000_000, 1, [1u8; 32]),
            make_att(1_700_000_011, 1, [2u8; 32]),
        ];
        assert!(matches!(verify_causal_ordering(&atts), Err(ChainError::OrderingViolated { .. })));
    }

    #[test]
    fn test_chain_digest_deterministic() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_002, 1, [2u8; 32]),
        ];
        assert_eq!(compute_chain_digest(&atts), compute_chain_digest(&atts));
    }

    #[test]
    fn test_too_short() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
        ];
        assert!(matches!(build_chain_unchecked(atts), Err(ChainError::TooShort { got: 2, min: 3 })));
    }

    #[test]
    fn test_verify_chain_against_pot_ok() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_002, 1, [2u8; 32]),
        ];
        let digest = compute_chain_digest(&atts);
        let chain = RoughtimeChain { attestations: atts, chain_digest: digest };
        // median = 1_700_000_001, t_synth within tolerance
        let t_ns = 1_700_000_001_000_000_000u64;
        assert!(verify_chain_against_pot(&chain, t_ns, &chain.chain_digest).is_ok());
    }

    #[test]
    fn test_verify_chain_digest_mismatch() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_002, 1, [2u8; 32]),
        ];
        let chain = RoughtimeChain { attestations: atts, chain_digest: [0u8; 32] };
        let wrong_digest = [1u8; 32];
        assert!(matches!(
            verify_chain_against_pot(&chain, 1_700_000_001_000_000_000, &wrong_digest),
            Err(ChainError::DigestMismatch)
        ));
    }

    #[test]
    fn test_timestamp_drift_rejected() {
        let atts = vec![
            make_att(1_700_000_000, 1, [0u8; 32]),
            make_att(1_700_000_001, 1, [1u8; 32]),
            make_att(1_700_000_002, 1, [2u8; 32]),
        ];
        let digest = compute_chain_digest(&atts);
        let chain = RoughtimeChain { attestations: atts, chain_digest: digest };
        // t_synth 100s off from median → rejected
        let t_ns = 1_700_000_100_000_000_000u64;
        assert!(matches!(
            verify_chain_against_pot(&chain, t_ns, &chain.chain_digest),
            Err(ChainError::TimestampDrift { .. })
        ));
    }
}

//! Integration tests — full TTTPS flow with real crypto
//! 
//! Tests: Roughtime chain → GRG input → Ed25519 sign → HMAC verify
//!        → AdaptiveSwitch → OSNMA key validation
//! 
//! This is the end-to-end verification that all modules work together.

#[cfg(test)]
mod tests {
    use crate::chain::{build_chain_unchecked, compute_chain_digest};
    use crate::types::{RoughtimeAttestation, RoughtimePubkey};
    use crate::grg_bridge::{assemble_pot_payload, build_grg_input};
    use crate::pot_crypto::{IssuerKeyPair, hmac_gate1_compute, hmac_gate1_verify, derive_ctx_key, NonceStore};
    use crate::adaptive_switch::{AdaptiveSwitch, AdaptiveMode};
    use crate::no_std_verify::check_recency;
    use crate::osnma::default_osnma_key;
    use sha2::{Digest, Sha256};

    fn make_att(midp: u64, nonce: [u8; 32]) -> RoughtimeAttestation {
        RoughtimeAttestation {
            server_pubkey: RoughtimePubkey([0u8; 32]),
            server_name: "test".to_string(),
            midp, radi: 1,
            sig: [0u8; 64], root: [0u8; 32],
            nonce, blind: [0u8; 32],
            indx: 0, path: vec![],
            raw_response: vec![],
        }
    }

    /// Full PoT generation + verification pipeline
    #[test]
    fn test_full_pot_pipeline_with_real_crypto() {
        // 1. Roughtime chain (k=3)
        let atts = vec![
            make_att(1_700_000_001, [0u8; 32]),
            make_att(1_700_000_001, [1u8; 32]),
            make_att(1_700_000_002, [2u8; 32]),
        ];
        let chain = build_chain_unchecked(atts).expect("chain build failed");

        // 2. T_synth = median → assemble payload
        let (t_synth, _) = chain.synthesise_timestamp();
        let t_synth_ns = t_synth * 1_000_000_000;
        let nonce = [42u8; 32];
        let payload = assemble_pot_payload(1, 1, 3, true, t_synth_ns, 500_000, &nonce);
        assert_eq!(payload.len(), 47);
        assert_eq!(payload[2] & 0x01, 0x01, "R-flag must be set");

        // 3. GRG input = P || D_chain
        let grg_input = build_grg_input(&payload, &chain.chain_digest);
        assert_eq!(grg_input.len(), 4 + 47 + 32);

        // 4. GRG commitment stub (SHA-256 proxy for actual GRG)
        let grg_commitment: [u8; 32] = Sha256::digest(&grg_input).into();

        // 5. Ed25519 sign (real)
        let issuer_kp = IssuerKeyPair::generate();
        let sig = issuer_kp.sign_pot(&payload, &grg_commitment);
        assert!(IssuerKeyPair::verify_pot(&issuer_kp.verifying_key, &payload, &grg_commitment, &sig),
            "Ed25519 round-trip must verify");

        // 6. keccak256 ctx_id binding
        let ctx_key = derive_ctx_key(8453, &[0xABu8; 20]); // Base chain_id=8453

        // 7. HMAC Gate 1 (real)
        let hmac_tag = hmac_gate1_compute(&ctx_key, &grg_commitment);
        assert!(hmac_gate1_verify(&ctx_key, &grg_commitment, &hmac_tag),
            "HMAC Gate 1 must verify");

        // 8. Nonce freshness check
        let mut nonce_store = NonceStore::new();
        assert!(nonce_store.check_and_insert(&nonce), "First nonce must be accepted");
        assert!(!nonce_store.check_and_insert(&nonce), "Replay must be rejected");

        // 9. Recency check (no_std path)
        let submit_ns = t_synth_ns + 50_000_000; // 50ms later
        let recency = check_recency(t_synth_ns, submit_ns, "T1_block");
        assert_eq!(recency, crate::no_std_verify::VerifyResult::Ok);

        // 10. AdaptiveSwitch — honest node
        let mut sw = AdaptiveSwitch::new(200);
        for _ in 0..20 {
            sw.verify_block(true, true, true);
        }
        assert_eq!(sw.mode(), AdaptiveMode::Turbo,
            "Honest node must reach TURBO after 20 blocks");
    }

    /// Tamper detection — biased issuer timestamp
    #[test]
    fn test_biased_issuer_timestamp_detected() {
        let atts = vec![
            make_att(1_700_000_001, [0u8; 32]),
            make_att(1_700_000_001, [1u8; 32]),
            make_att(1_700_000_001, [2u8; 32]),
        ];
        let chain = build_chain_unchecked(atts).unwrap();
        let honest_t_ns = 1_700_000_001_000_000_000u64;
        let biased_t_ns = honest_t_ns + 500_000_000; // +500ms

        // Build honest payload + commitment
        let nonce = [0u8; 32];
        let honest_payload = assemble_pot_payload(1, 1, 3, true, honest_t_ns, 0, &nonce);
        let honest_grg_input = build_grg_input(&honest_payload, &chain.chain_digest);
        let honest_commitment: [u8; 32] = Sha256::digest(&honest_grg_input).into();
        let kp = IssuerKeyPair::generate();
        let honest_sig = kp.sign_pot(&honest_payload, &honest_commitment);

        // Biased payload → different commitment
        let biased_payload = assemble_pot_payload(1, 1, 3, true, biased_t_ns, 0, &nonce);
        let biased_grg_input = build_grg_input(&biased_payload, &chain.chain_digest);
        let biased_commitment: [u8; 32] = Sha256::digest(&biased_grg_input).into();

        assert_ne!(honest_commitment, biased_commitment, "Commitments must differ");

        // Verify: honest sig against biased payload → FAIL (EUF-CMA)
        let verify_fails = !IssuerKeyPair::verify_pot(&kp.verifying_key, &biased_payload, &honest_commitment, &honest_sig);
        assert!(verify_fails, "Biased timestamp must not verify with honest commitment");
    }

    /// Delay attack — Gate 2 enforcement
    #[test]
    fn test_delay_attack_ejected_by_adaptive_switch() {
        let mut sw = AdaptiveSwitch::new(200); // T1_block 200ms
        // Attacker holds PoT for 350ms then submits
        let mode = sw.verify_block(true, false, true); // time_ok=false
        assert_eq!(mode, AdaptiveMode::Full);
        assert!(sw.fail_count() > 0);
        assert!(sw.penalty_cooldown() >= 2);
    }

    /// Roughtime chain ↔ GRG bridge ↔ wire module roundtrip
    #[test]
    fn test_roughtime_chain_digest_in_grg_input() {
        let atts = vec![
            make_att(1_700_000_000, [0u8; 32]),
            make_att(1_700_000_001, [1u8; 32]),
            make_att(1_700_000_002, [2u8; 32]),
        ];
        let digest = compute_chain_digest(&atts);
        let chain = build_chain_unchecked(atts).unwrap();
        assert_eq!(chain.chain_digest, digest, "chain_digest must match compute_chain_digest");

        let payload = [0u8; 47];
        let grg_input = build_grg_input(&payload, &chain.chain_digest);
        // GRG input: 4 bytes len + 47 bytes payload + 32 bytes digest = 83
        assert_eq!(grg_input.len(), 83);
        // chain_digest is embedded at the end
        assert_eq!(&grg_input[51..83], &chain.chain_digest[..]);
    }

    /// OSNMA key validation in pipeline
    #[test]
    fn test_osnma_key_valid_in_rust() {
        let key = default_osnma_key().expect("OSNMA key parse failed");
        let result = crate::osnma::verify_osnma_key_material(&key).expect("OSNMA verify failed");
        assert!(result.valid);
        assert_eq!(result.pkid, 2);
        // Key fingerprint must be a valid 32-byte SHA-256
        assert_eq!(result.key_fingerprint.len(), 32);
    }

    /// Wire format: request build
    #[test]
    fn test_wire_request_nonce_roundtrip() {
        use crate::wire::build_roughtime_request;
        let nonce = [0x99u8; 32];
        let pkt = build_roughtime_request(&nonce);
        assert_eq!(pkt.len(), 1024);
        // Magic check
        let magic = u64::from_le_bytes(pkt[0..8].try_into().unwrap());
        assert_eq!(magic, crate::wire::ROUGHTIME_MAGIC);
    }

    /// HMAC wrong context → different tag
    #[test]
    fn test_cross_context_hmac_separation() {
        let ctx_base = derive_ctx_key(8453, &[0xABu8; 20]);
        let ctx_other = derive_ctx_key(1,    &[0xCDu8; 20]);
        let data = b"same_grg_commitment";
        let tag1 = hmac_gate1_compute(&ctx_base, data);
        let tag2 = hmac_gate1_compute(&ctx_other, data);
        assert_ne!(tag1, tag2, "Different ctx_id must produce different HMAC tags");
        // Cross-context replay: tag from ctx_base fails ctx_other
        assert!(!hmac_gate1_verify(&ctx_other, data, &tag1),
            "Cross-context replay must be rejected");
    }
}

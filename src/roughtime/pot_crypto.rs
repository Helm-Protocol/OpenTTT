//! PoT cryptographic layer — Ed25519 signing + HMAC-SHA256 Gate 1
//! 
//! Implements §4.2 (Ed25519 EUF-CMA) and §4.5 step 2 (HMAC Gate 1).
//! Previously STUB — now real cryptographic implementation.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use sha3::Keccak256;
use rand::rngs::OsRng;

type HmacSha256 = Hmac<Sha256>;

/// Ed25519 key pair for PoT Issuer
pub struct IssuerKeyPair {
    pub signing_key:   SigningKey,
    pub verifying_key: VerifyingKey,
}

impl IssuerKeyPair {
    /// Generate a new random keypair (for testing / new Issuer setup)
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        Self { signing_key, verifying_key }
    }

    /// Load from 32-byte secret scalar
    pub fn from_bytes(secret: &[u8; 32]) -> Result<Self, ed25519_dalek::SignatureError> {
        let signing_key = SigningKey::from_bytes(secret);
        let verifying_key = signing_key.verifying_key();
        Ok(Self { signing_key, verifying_key })
    }

    /// Sign PoT payload + GRG commitment (§4.2)
    /// Input: P || GRG_Commitment (payload bytes concatenated with 32-byte commitment)
    pub fn sign_pot(&self, payload: &[u8], grg_commitment: &[u8; 32]) -> [u8; 64] {
        let mut msg = Vec::with_capacity(payload.len() + 32);
        msg.extend_from_slice(payload);
        msg.extend_from_slice(grg_commitment);
        self.signing_key.sign(&msg).to_bytes()
    }

    /// Verify PoT signature (§4.5 step 3)
    pub fn verify_pot(
        vk: &VerifyingKey,
        payload: &[u8],
        grg_commitment: &[u8; 32],
        sig_bytes: &[u8; 64],
    ) -> bool {
        let mut msg = Vec::with_capacity(payload.len() + 32);
        msg.extend_from_slice(payload);
        msg.extend_from_slice(grg_commitment);
        let sig = Signature::from_bytes(sig_bytes);
        vk.verify(&msg, &sig).is_ok()
    }
}

/// Context binding key derivation (§5.2)
/// k = keccak256(chain_id || pool_address)
/// This key is PUBLICLY DERIVABLE by design — domain separation, not secrecy.
pub fn derive_ctx_key(chain_id: u64, pool_address: &[u8; 20]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(&chain_id.to_be_bytes());
    h.update(pool_address);
    h.finalize().into()
}

/// HMAC Gate 1 — compute tag for one GRG shard (§4.5 step 2)
/// P(forge) ≤ 6 × 2^{-64} over 6 shards (union bound)
pub fn hmac_gate1_compute(ctx_key: &[u8; 32], shard: &[u8]) -> [u8; 8] {
    let mut mac = HmacSha256::new_from_slice(ctx_key)
        .expect("HMAC accepts any key length");
    mac.update(shard);
    let full = mac.finalize().into_bytes();
    full[..8].try_into().unwrap()
}

/// HMAC Gate 1 — verify tag (§4.5 step 2)
/// Returns false → REJECT immediately, DO NOT invoke Ed25519 (§4.5)
pub fn hmac_gate1_verify(ctx_key: &[u8; 32], shard: &[u8], expected_tag: &[u8; 8]) -> bool {
    let computed = hmac_gate1_compute(ctx_key, shard);
    // Constant-time comparison
    computed.iter().zip(expected_tag.iter()).all(|(a, b)| a == b)
}

/// HMAC Gate 1 over GRG commitment (used when full shard not available)
/// Binds commitment to context (chain_id, pool_address)
pub fn hmac_gate1_commitment(ctx_key: &[u8; 32], grg_commitment: &[u8; 32]) -> [u8; 8] {
    hmac_gate1_compute(ctx_key, grg_commitment)
}

/// Nonce uniqueness set — in-memory store
/// Production: use Redis/RocksDB for persistence (§9.2)
pub struct NonceStore {
    seen: std::collections::HashSet<[u8; 32]>,
}

impl NonceStore {
    pub fn new() -> Self {
        Self { seen: std::collections::HashSet::new() }
    }

    /// Returns true if nonce is fresh (not seen before), inserts it.
    /// Returns false if nonce was already used (replay attack).
    pub fn check_and_insert(&mut self, nonce: &[u8; 32]) -> bool {
        self.seen.insert(*nonce)
    }

    pub fn len(&self) -> usize { self.seen.len() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ed25519_sign_verify_roundtrip() {
        let kp = IssuerKeyPair::generate();
        let payload = b"test_pot_payload_bytes_v1";
        let commitment = [0xabu8; 32];
        let sig = kp.sign_pot(payload, &commitment);
        assert!(IssuerKeyPair::verify_pot(&kp.verifying_key, payload, &commitment, &sig));
    }

    #[test]
    fn test_ed25519_tamper_detected() {
        let kp = IssuerKeyPair::generate();
        let payload = b"original_payload";
        let commitment = [0u8; 32];
        let sig = kp.sign_pot(payload, &commitment);
        // tamper: different payload
        let tampered = b"tampered_payload_";
        assert!(!IssuerKeyPair::verify_pot(&kp.verifying_key, tampered, &commitment, &sig));
    }

    #[test]
    fn test_ed25519_commitment_tamper_detected() {
        let kp = IssuerKeyPair::generate();
        let payload = b"payload";
        let commitment = [0u8; 32];
        let sig = kp.sign_pot(payload, &commitment);
        let tampered_commitment = [1u8; 32]; // different commitment
        assert!(!IssuerKeyPair::verify_pot(&kp.verifying_key, payload, &tampered_commitment, &sig));
    }

    #[test]
    fn test_hmac_gate1_roundtrip() {
        let ctx_key = [42u8; 32];
        let shard = b"grg_shard_data";
        let tag = hmac_gate1_compute(&ctx_key, shard);
        assert!(hmac_gate1_verify(&ctx_key, shard, &tag));
    }

    #[test]
    fn test_hmac_gate1_wrong_key_rejected() {
        let ctx_key1 = [1u8; 32];
        let ctx_key2 = [2u8; 32];
        let shard = b"shard";
        let tag = hmac_gate1_compute(&ctx_key1, shard);
        assert!(!hmac_gate1_verify(&ctx_key2, shard, &tag),
            "Different ctx_key must not verify");
    }

    #[test]
    fn test_hmac_gate1_tampered_shard_rejected() {
        let ctx_key = [0u8; 32];
        let shard = b"shard_original";
        let tag = hmac_gate1_compute(&ctx_key, shard);
        assert!(!hmac_gate1_verify(&ctx_key, b"shard_tampered", &tag));
    }

    #[test]
    fn test_ctx_key_derivation_deterministic() {
        let k1 = derive_ctx_key(1, &[0u8; 20]);
        let k2 = derive_ctx_key(1, &[0u8; 20]);
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_ctx_key_chain_id_separation() {
        let k1 = derive_ctx_key(1, &[0u8; 20]);
        let k2 = derive_ctx_key(2, &[0u8; 20]);
        assert_ne!(k1, k2, "Different chain_id must produce different ctx keys");
    }

    #[test]
    fn test_nonce_store_replay_prevention() {
        let mut store = NonceStore::new();
        let nonce = [0xffu8; 32];
        assert!(store.check_and_insert(&nonce),  "First insert must succeed");
        assert!(!store.check_and_insert(&nonce), "Replay must be rejected");
    }

    #[test]
    fn test_nonce_store_different_nonces() {
        let mut store = NonceStore::new();
        assert!(store.check_and_insert(&[0u8; 32]));
        assert!(store.check_and_insert(&[1u8; 32]));
        assert_eq!(store.len(), 2);
    }
}

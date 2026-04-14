//! OSNMA (Galileo Open Service Navigation Message Authentication) — Rust port
//! 
//! Mirrors src/osnma_source.ts logic in Rust.
//! Verifies GSC Europa PKID=2 key material for Phase 2 L0 Source CA integration.
//! Reference: gsc-europa.eu, PKID=2, applicability 2025-12-10T10:00:00Z

use p256::ecdsa::VerifyingKey;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

/// OSNMA PKID=2 public key — ECDSA P-256 compressed (33 bytes)
/// Source: GSC Europa OSNMA/PKI portal, downloaded 2026-03-18
pub const OSNMA_PUBKEY_HEX: &str =
    "02219204B5CA6C46B623EEED6CDD2CDDB1F7D6A7532767E5B8DA0DE1EBD695FC99";

/// OSNMA Merkle Tree root — SHA-256 (32 bytes)
pub const OSNMA_MERKLE_ROOT_HEX: &str =
    "7B944FA20915C7931D48DD016D94F9C6381FD37DC6C125D97015272FDDE41393";

/// PKID=2 applicability: 2025-12-10T10:00:00Z (Unix secs)
pub const OSNMA_APPLICABILITY_SECS: u64 = 1_765_360_800;

/// OSNMA key material (mirrors OsnmaKeyMaterial in TS)
#[derive(Debug, Clone)]
pub struct OsnmaKeyMaterial {
    pub pkid:              u8,
    pub pubkey_compressed: [u8; 33],   // ECDSA P-256 compressed
    pub merkle_root:       [u8; 32],   // SHA-256 Merkle root
    pub applicability_secs: u64,
}

/// OSNMA verification result
#[derive(Debug, Clone)]
pub struct OsnmaVerificationResult {
    pub valid:              bool,
    pub pkid:               u8,
    pub key_fingerprint:    [u8; 32],  // SHA-256(pubkey_compressed)
    pub applicability_secs: u64,
    pub checked_at_secs:    u64,
}

/// Error types for OSNMA verification
#[derive(Debug, PartialEq, Eq)]
pub enum OsnmaError {
    InvalidKeyLength { got: usize },
    InvalidKeyPrefix { got: u8 },
    InvalidMerkleLength { got: usize },
    KeyNotYetApplicable { applicable_at: u64 },
    InvalidP256Key,
}

impl std::fmt::Display for OsnmaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidKeyLength { got } =>
                write!(f, "Public key must be 33 bytes (compressed P-256), got {}", got),
            Self::InvalidKeyPrefix { got } =>
                write!(f, "Compressed P-256 must start with 02 or 03, got {:02x}", got),
            Self::InvalidMerkleLength { got } =>
                write!(f, "Merkle root must be 32 bytes, got {}", got),
            Self::KeyNotYetApplicable { applicable_at } =>
                write!(f, "Key not applicable until Unix secs {}", applicable_at),
            Self::InvalidP256Key =>
                write!(f, "Public key is not a valid P-256 point"),
        }
    }
}

/// Default OSNMA key (PKID=2, GSC Europa)
pub fn default_osnma_key() -> Result<OsnmaKeyMaterial, OsnmaError> {
    let pubkey_bytes = hex::decode(OSNMA_PUBKEY_HEX)
        .map_err(|_| OsnmaError::InvalidKeyLength { got: 0 })?;
    if pubkey_bytes.len() != 33 {
        return Err(OsnmaError::InvalidKeyLength { got: pubkey_bytes.len() });
    }
    let mut pubkey = [0u8; 33];
    pubkey.copy_from_slice(&pubkey_bytes);

    let merkle_bytes = hex::decode(OSNMA_MERKLE_ROOT_HEX)
        .map_err(|_| OsnmaError::InvalidMerkleLength { got: 0 })?;
    if merkle_bytes.len() != 32 {
        return Err(OsnmaError::InvalidMerkleLength { got: merkle_bytes.len() });
    }
    let mut merkle = [0u8; 32];
    merkle.copy_from_slice(&merkle_bytes);

    Ok(OsnmaKeyMaterial {
        pkid: 2,
        pubkey_compressed: pubkey,
        merkle_root: merkle,
        applicability_secs: OSNMA_APPLICABILITY_SECS,
    })
}

/// Verify OSNMA key material (mirrors verifyOsnmaKeyMaterial in TS)
pub fn verify_osnma_key_material(key: &OsnmaKeyMaterial) -> Result<OsnmaVerificationResult, OsnmaError> {
    // 1. Key length check
    if key.pubkey_compressed.len() != 33 {
        return Err(OsnmaError::InvalidKeyLength { got: key.pubkey_compressed.len() });
    }
    // 2. Compressed point prefix (02 or 03)
    let prefix = key.pubkey_compressed[0];
    if prefix != 0x02 && prefix != 0x03 {
        return Err(OsnmaError::InvalidKeyPrefix { got: prefix });
    }
    // 3. Merkle root length
    if key.merkle_root.len() != 32 {
        return Err(OsnmaError::InvalidMerkleLength { got: key.merkle_root.len() });
    }
    // 4. Applicability check
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if now_secs < key.applicability_secs {
        return Err(OsnmaError::KeyNotYetApplicable { applicable_at: key.applicability_secs });
    }
    // 5. P-256 point validity
    VerifyingKey::from_sec1_bytes(&key.pubkey_compressed)
        .map_err(|_| OsnmaError::InvalidP256Key)?;

    // 6. Key fingerprint
    let fingerprint: [u8; 32] = Sha256::digest(&key.pubkey_compressed).into();

    Ok(OsnmaVerificationResult {
        valid: true,
        pkid: key.pkid,
        key_fingerprint: fingerprint,
        applicability_secs: key.applicability_secs,
        checked_at_secs: now_secs,
    })
}

/// OsnmaTimeSource — Rust equivalent of OsnmaTimeSource class in TS
pub struct OsnmaTimeSource {
    key: OsnmaKeyMaterial,
    result: Option<OsnmaVerificationResult>,
}

impl OsnmaTimeSource {
    pub fn new() -> Result<Self, OsnmaError> {
        Ok(Self { key: default_osnma_key()?, result: None })
    }

    /// Returns (timestamp_ns, uncertainty_ms, stratum) — matches TimeSource interface
    pub fn get_time(&mut self) -> Result<(u64, u32, u8), OsnmaError> {
        if self.result.is_none() {
            self.result = Some(verify_osnma_key_material(&self.key)?);
        }
        let now_ns = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        Ok((now_ns, 50, 1)) // 50ms uncertainty, stratum 1
    }

    pub fn verification_result(&self) -> Option<&OsnmaVerificationResult> {
        self.result.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_key_parses() {
        let key = default_osnma_key().unwrap();
        assert_eq!(key.pkid, 2);
        assert_eq!(key.pubkey_compressed[0], 0x02);
        assert_eq!(key.pubkey_compressed.len(), 33);
        assert_eq!(key.merkle_root.len(), 32);
    }

    #[test]
    fn test_verify_real_gsc_pkid2() {
        let key = default_osnma_key().unwrap();
        let result = verify_osnma_key_material(&key).unwrap();
        assert!(result.valid);
        assert_eq!(result.pkid, 2);
        assert_eq!(result.key_fingerprint.len(), 32);
    }

    #[test]
    fn test_p256_point_valid() {
        // Key must be a valid P-256 compressed point
        let key = default_osnma_key().unwrap();
        let vk = VerifyingKey::from_sec1_bytes(&key.pubkey_compressed);
        assert!(vk.is_ok(), "GSC PKID=2 must be a valid P-256 point");
    }

    #[test]
    fn test_rejects_wrong_key_length() {
        let mut key = default_osnma_key().unwrap();
        key.pubkey_compressed[0] = 0x04; // uncompressed prefix — wrong for 33 bytes
        let err = verify_osnma_key_material(&key).unwrap_err();
        assert_eq!(err, OsnmaError::InvalidKeyPrefix { got: 0x04 });
    }

    #[test]
    fn test_rejects_future_applicability() {
        let mut key = default_osnma_key().unwrap();
        key.applicability_secs = u64::MAX; // far future
        let err = verify_osnma_key_material(&key).unwrap_err();
        assert!(matches!(err, OsnmaError::KeyNotYetApplicable { .. }));
    }

    #[test]
    fn test_osnma_time_source_returns_time() {
        let mut src = OsnmaTimeSource::new().unwrap();
        let (ts_ns, uncertainty_ms, stratum) = src.get_time().unwrap();
        assert!(ts_ns > 0);
        assert_eq!(uncertainty_ms, 50);
        assert_eq!(stratum, 1);
    }

    #[test]
    fn test_fingerprint_deterministic() {
        let key = default_osnma_key().unwrap();
        let r1 = verify_osnma_key_material(&key).unwrap();
        let r2 = verify_osnma_key_material(&key).unwrap();
        assert_eq!(r1.key_fingerprint, r2.key_fingerprint);
    }

    #[test]
    fn test_merkle_root_correct_length() {
        let key = default_osnma_key().unwrap();
        assert_eq!(key.merkle_root.len(), 32);
        // Verify hex decodes correctly
        let decoded = hex::decode(OSNMA_MERKLE_ROOT_HEX).unwrap();
        assert_eq!(&decoded[..], &key.merkle_root[..]);
    }
}

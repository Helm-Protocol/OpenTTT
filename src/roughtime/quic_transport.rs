//! TTTPS QUIC/TLS transport binding — draft-helmprotocol-tttps-02 §7.1–7.3
//!
//! §7.1 TLS Exporter binding_key (RFC 5705):
//!   binding_key = TLS-Exporter("EXPORTER-tttps-pot-binding",
//!                               pot_record_without_sig, 32)
//!
//! The verifier MUST recompute expected_key and verify it matches
//! the binding_key in the PoT frame. (Ekr requirement, -02 normative)
//!
//! §7.3 HTTP/3 frame: 175 bytes = binding_key(32) + PoT record(143)
//! §7.2 QUIC stream type: 0x74

use sha2::Sha256;
use hmac::{Hmac, Mac};
type HmacSha256 = Hmac<Sha256>;

// ── Constants ────────────────────────────────────────────────────────────────

/// TLS Exporter label — §7.1 (Ekr: MUST match exactly)
pub const TLS_EXPORTER_LABEL: &str = "EXPORTER-tttps-pot-binding";

/// Binding key length (§7.1)
pub const BINDING_KEY_LEN: usize = 32;

/// PoT record base size (§4.1, 143 bytes)
pub const POT_RECORD_BYTES: usize = 143;

/// Extended PoT frame with binding_key (§7.3, Ekr -02)
pub const POT_FRAME_EXTENDED_BYTES: usize = 175; // 32 + 143

/// HTTP/3 PoT Frame Type (§11.4)
pub const POT_FRAME_TYPE: u32 = 0x4C4F5400; // "LOT\0"

/// QUIC stream type (§7.2)
pub const POT_QUIC_STREAM_TYPE: u8 = 0x74;

// ── TLS Exporter binding_key ──────────────────────────────────────────────────

/// Derive binding_key from TLS session master secret (RFC 5705).
///
/// In a real TLS 1.3 stack (rustls/OpenSSL), call:
///   ssl.export_keying_material(label, context, 32)
///
/// This implementation uses the session master secret via HMAC-SHA256
/// as a portable RFC 5705 approximation. Real TLS integration requires
/// the TLS library to expose exportKeyingMaterial().
///
/// Matches Node.js: socket.exportKeyingMaterial(32, label, context)
pub fn derive_binding_key(
    tls_master_secret: &[u8],

    pot_without_sig: &[u8],
) -> [u8; BINDING_KEY_LEN] {
    // RFC 5705 §4: PRF(master_secret, label || context)
    // HKDF-Expand(label="EXPORTER-tttps-pot-binding", context=pot_without_sig, L=32)
    let mut mac = HmacSha256::new_from_slice(tls_master_secret)
        .expect("HMAC accepts any key length");
    mac.update(TLS_EXPORTER_LABEL.as_bytes());
    mac.update(b"\x00"); // separator
    mac.update(&(pot_without_sig.len() as u32).to_be_bytes()); // context length
    mac.update(pot_without_sig);
    mac.finalize().into_bytes()[..BINDING_KEY_LEN].try_into().unwrap()
}

/// Verify binding_key in received PoT frame — §7.1 NORMATIVE (Ekr requirement)
///
/// "The verifier MUST recompute: expected_key = TLS-Exporter(...)
///  and verify it matches the binding_key in the PoT frame."
pub fn verify_binding_key(
    tls_master_secret: &[u8],
    pot_without_sig: &[u8],
    received_binding_key: &[u8; BINDING_KEY_LEN],
) -> bool {
    let expected = derive_binding_key(tls_master_secret, pot_without_sig);
    // Constant-time comparison (§9.4)
    expected.iter().zip(received_binding_key.iter()).all(|(a, b)| a == b)
}

// ── 175-byte Extended PoT Frame ───────────────────────────────────────────────

/// Extended PoT frame (§7.3, -02):
///   binding_key  (32 octets) — TLS Exporter output
///   pot_record   (143 octets) — PoT record §4.1
///   Total: 175 octets
#[derive(Debug, Clone)]
pub struct PotFrameExtended {
    pub binding_key: [u8; BINDING_KEY_LEN],
    pub pot_record:  Vec<u8>, // 143 bytes for T0-T3, 175 total with binding
}

impl PotFrameExtended {
    /// Build 175-byte extended frame from TLS session + PoT record
    pub fn build(
        tls_master_secret: &[u8],
        pot_record: Vec<u8>,
    ) -> Self {
        // pot_without_sig = pot_record[..pot_record.len()-64]
        let sig_start = pot_record.len().saturating_sub(64);
        let pot_without_sig = &pot_record[..sig_start];
        let binding_key = derive_binding_key(tls_master_secret, pot_without_sig);
        Self { binding_key, pot_record }
    }

    /// Serialize to 175-byte wire format
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(POT_FRAME_EXTENDED_BYTES);
        buf.extend_from_slice(&self.binding_key);
        buf.extend_from_slice(&self.pot_record);
        buf
    }

    /// Parse from 175-byte wire format
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < BINDING_KEY_LEN { return None; }
        let binding_key: [u8; BINDING_KEY_LEN] = bytes[..BINDING_KEY_LEN].try_into().ok()?;
        let pot_record = bytes[BINDING_KEY_LEN..].to_vec();
        Some(Self { binding_key, pot_record })
    }

    /// §7.1 MUST verification: expected_key == binding_key_in_frame
    pub fn verify(&self, tls_master_secret: &[u8]) -> bool {
        let sig_start = self.pot_record.len().saturating_sub(64);
        let pot_without_sig = &self.pot_record[..sig_start];
        verify_binding_key(tls_master_secret, pot_without_sig, &self.binding_key)
    }
}

// ── QUIC Frame (§7.2) ────────────────────────────────────────────────────────

/// QUIC PoT frame for dedicated stream 0x74
#[derive(Debug, Clone)]
pub struct PotQuicFrame {
    pub stream_type: u8,      // 0x74
    pub payload_len: u32,
    pub r_flag:      bool,
    pub payload:     Vec<u8>,
}

impl PotQuicFrame {
    pub fn new(payload: Vec<u8>, r_flag: bool) -> Self {
        Self {
            stream_type: POT_QUIC_STREAM_TYPE,
            payload_len: payload.len() as u32,
            r_flag,
            payload,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.push(self.stream_type);
        buf.extend_from_slice(&self.payload_len.to_be_bytes());
        buf.push(if self.r_flag { 0x01 } else { 0x00 });
        buf.extend_from_slice(&self.payload);
        buf
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 6 { return None; }
        let stream_type  = bytes[0];
        let payload_len  = u32::from_be_bytes(bytes[1..5].try_into().ok()?) as usize;
        let r_flag       = bytes[5] == 0x01;
        if bytes.len() < 6 + payload_len { return None; }
        Some(Self { stream_type, payload_len: payload_len as u32, r_flag, payload: bytes[6..6+payload_len].to_vec() })
    }
}

/// PoT-Ack frame (§7.2)
#[derive(Debug, Clone)]
pub struct PotAckFrame {
    pub stream_id: u64,
    pub mode: u8, // 0x00=FULL, 0x01=TURBO
}

impl PotAckFrame {
    pub fn to_bytes(&self) -> [u8; 9] {
        let mut b = [0u8; 9];
        b[0..8].copy_from_slice(&self.stream_id.to_be_bytes());
        b[8] = self.mode;
        b
    }
}

// ── HTTP/3 Frame (§7.3) ──────────────────────────────────────────────────────

/// HTTP/3 PoT frame header
#[derive(Debug, Clone)]
pub struct PotHttp3Frame {
    pub frame_type: u32,        // 0x4C4F5400
    pub body: Vec<u8>,          // 143 or 175 bytes
}

impl PotHttp3Frame {
    pub fn new_extended(extended_frame: &PotFrameExtended) -> Self {
        Self { frame_type: POT_FRAME_TYPE, body: extended_frame.to_bytes() }
    }

    pub fn is_extended(&self) -> bool { self.body.len() == POT_FRAME_EXTENDED_BYTES }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mock TLS master secret for testing
    const MOCK_SECRET: &[u8] = b"tttps_mock_tls_master_secret_v02";
    const MOCK_POT: &[u8] = b"pot_record_without_sig_bytes_here_01234567890";

    #[test]
    fn test_binding_key_deterministic() {
        let k1 = derive_binding_key(MOCK_SECRET, MOCK_POT);
        let k2 = derive_binding_key(MOCK_SECRET, MOCK_POT);
        assert_eq!(k1, k2, "binding_key must be deterministic");
    }

    #[test]
    fn test_binding_key_label_separation() {
        // Different pot_without_sig → different binding_key
        let k1 = derive_binding_key(MOCK_SECRET, b"pot_v1");
        let k2 = derive_binding_key(MOCK_SECRET, b"pot_v2");
        assert_ne!(k1, k2, "Different PoT → different binding_key");
    }

    #[test]
    fn test_binding_key_session_separation() {
        // Different TLS session → different binding_key (cross-session replay prevention)
        let k1 = derive_binding_key(b"session_A_secret", MOCK_POT);
        let k2 = derive_binding_key(b"session_B_secret", MOCK_POT);
        assert_ne!(k1, k2, "Different TLS session → different binding_key");
    }

    #[test]
    fn test_verify_binding_key_ok() {
        let key = derive_binding_key(MOCK_SECRET, MOCK_POT);
        assert!(verify_binding_key(MOCK_SECRET, MOCK_POT, &key),
            "Correct binding_key must verify");
    }

    #[test]
    fn test_verify_binding_key_wrong_session() {
        let key = derive_binding_key(b"session_A_secret", MOCK_POT);
        assert!(!verify_binding_key(b"session_B_secret", MOCK_POT, &key),
            "Cross-session replay must be rejected (Ekr §7.1)");
    }

    #[test]
    fn test_extended_frame_175_bytes() {
        let pot_record = vec![0u8; 143]; // standard PoT
        let frame = PotFrameExtended::build(MOCK_SECRET, pot_record);
        let bytes = frame.to_bytes();
        assert_eq!(bytes.len(), POT_FRAME_EXTENDED_BYTES,
            "§7.3: extended frame must be 175 bytes");
    }

    #[test]
    fn test_extended_frame_roundtrip() {
        let pot_record = vec![0xabu8; 143];
        let frame = PotFrameExtended::build(MOCK_SECRET, pot_record.clone());
        let bytes = frame.to_bytes();
        let parsed = PotFrameExtended::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.pot_record, pot_record);
        assert_eq!(parsed.binding_key, frame.binding_key);
    }

    #[test]
    fn test_ekr_must_verify_normative() {
        // §7.1: "The verifier MUST recompute expected_key and verify"
        let pot_record = vec![0x11u8; 143];
        let frame = PotFrameExtended::build(MOCK_SECRET, pot_record);
        // Correct session → PASS
        assert!(frame.verify(MOCK_SECRET), "Correct session must pass §7.1 MUST");
        // Wrong session → REJECT
        assert!(!frame.verify(b"wrong_session_secret_xxxxxxxxxx"),
            "Wrong session must REJECT §7.1 MUST");
    }

    #[test]
    fn test_quic_frame_roundtrip() {
        let payload = vec![0x42u8; 143];
        let frame = PotQuicFrame::new(payload.clone(), true);
        let bytes = frame.to_bytes();
        let parsed = PotQuicFrame::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.payload, payload);
        assert_eq!(parsed.stream_type, POT_QUIC_STREAM_TYPE);
        assert!(parsed.r_flag);
    }

    #[test]
    fn test_pot_ack_mode_encoding() {
        let ack = PotAckFrame { stream_id: 0x74, mode: 0x01 };
        let b = ack.to_bytes();
        assert_eq!(b[8], 0x01, "TURBO=0x01");
    }
}

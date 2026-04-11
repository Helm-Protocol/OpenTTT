//! QUIC transport binding — draft-helmprotocol-tttps-02 §7.2
//!
//! Full QUIC implementation requires Quinn crate (future sprint).
//! This module provides:
//!   - PoT frame serialisation for QUIC STREAM frames
//!   - HTTP/3 frame type 0x3T (§7.3) stub
//!   - TLS Exporter binding key derivation (§7.1, RFC 5705)

use sha2::{Digest, Sha256};

/// HTTP/3 PoT Frame Type (IANA pending, §11.4)
/// Private Use range: 0x3T notation → 0x3000 + T tier index
pub const POT_FRAME_TYPE_BASE: u64 = 0x3000;

/// TLS Exporter Label (§7.1, RFC 5705)
pub const TLS_EXPORTER_LABEL: &str = "EXPORTER-tttps-pot-binding";

/// QUIC stream ID convention for TTTPS PoT frames
/// Client-initiated bidirectional stream, stream 0 reserved
pub const POT_STREAM_ID: u64 = 4; // first non-reserved bidirectional

/// PoT QUIC frame header (9 bytes)
///   frame_type: u64 varint
///   payload_len: u32 BE
///   r_flag: u8
#[derive(Debug, Clone)]
pub struct PotQuicFrame {
    pub frame_type:  u64,
    pub payload_len: u32,
    pub r_flag:      bool,
    pub payload:     Vec<u8>,
}

impl PotQuicFrame {
    pub fn new(tier_idx: u8, payload: Vec<u8>, r_flag: bool) -> Self {
        Self {
            frame_type:  POT_FRAME_TYPE_BASE + tier_idx as u64,
            payload_len: payload.len() as u32,
            r_flag,
            payload,
        }
    }

    /// Serialise to bytes for QUIC STREAM frame data field
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        // frame_type as 1-byte varint (simplified — full QUIC uses QUIC varint)
        buf.push(self.frame_type as u8);
        buf.extend_from_slice(&self.payload_len.to_be_bytes());
        buf.push(if self.r_flag { 0x01 } else { 0x00 });
        buf.extend_from_slice(&self.payload);
        buf
    }

    /// Parse from bytes (minimal, for testing)
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 6 { return None; }
        let frame_type  = bytes[0] as u64;
        let payload_len = u32::from_be_bytes(bytes[1..5].try_into().ok()?) as usize;
        let r_flag      = bytes[5] == 0x01;
        if bytes.len() < 6 + payload_len { return None; }
        let payload = bytes[6..6 + payload_len].to_vec();
        Some(Self { frame_type, payload_len: payload_len as u32, r_flag, payload })
    }
}

/// TLS Exporter binding key derivation (§7.1, RFC 5705)
/// 
/// In production: derived from TLS session via TLS-Exporter(label, pot_bytes, 32)
/// Here: SHA-256 stub for testing (real impl requires TLS session handle)
pub fn derive_binding_key_stub(label: &str, pot_bytes: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(label.as_bytes());
    h.update(pot_bytes);
    h.finalize().into()
}

/// PoT-Ack frame (server → client, confirms PoT received)
#[derive(Debug, Clone)]
pub struct PotAckFrame {
    pub stream_id: u64,
    pub mode:      u8,  // 0x00=FULL, 0x01=TURBO
}

impl PotAckFrame {
    pub fn to_bytes(&self) -> [u8; 9] {
        let mut buf = [0u8; 9];
        buf[0..8].copy_from_slice(&self.stream_id.to_be_bytes());
        buf[8] = self.mode;
        buf
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quic_frame_roundtrip() {
        let payload = vec![1u8, 2, 3, 4, 5];
        let frame = PotQuicFrame::new(1, payload.clone(), true);
        let bytes = frame.to_bytes();
        let parsed = PotQuicFrame::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.payload, payload);
        assert!(parsed.r_flag);
    }

    #[test]
    fn test_frame_type_tier_encoding() {
        let frame = PotQuicFrame::new(3, vec![], false); // T3_micro
        assert_eq!(frame.frame_type, 0x3003);
    }

    #[test]
    fn test_binding_key_deterministic() {
        let k1 = derive_binding_key_stub(TLS_EXPORTER_LABEL, b"test_pot");
        let k2 = derive_binding_key_stub(TLS_EXPORTER_LABEL, b"test_pot");
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_binding_key_label_separation() {
        let k1 = derive_binding_key_stub("label_a", b"same_pot");
        let k2 = derive_binding_key_stub("label_b", b"same_pot");
        assert_ne!(k1, k2, "Different labels must produce different keys");
    }

    #[test]
    fn test_pot_ack_serialisation() {
        let ack = PotAckFrame { stream_id: 4, mode: 0x01 };
        let bytes = ack.to_bytes();
        assert_eq!(bytes[8], 0x01);
    }
}

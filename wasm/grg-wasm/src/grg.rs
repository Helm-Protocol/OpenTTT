//! GRG Pipeline: Golomb-Rice → Reed-Solomon → Golay(24,12) + HMAC-SHA256
//! Ported from OpenTTT grg_forward.ts + grg_inverse.ts

use hmac::{Hmac, Mac};
use sha2::Sha256;
use super::golay::{golay_encode, golay_decode};
use super::reed_solomon::{rs_encode, rs_decode};
use super::hmac_key::derive_hmac_key;

pub type GrgShards = Vec<Vec<u8>>;

const DATA_SHARDS: usize = 4;
const PARITY_SHARDS: usize = 2;
const HMAC_LEN: usize = 8;
const MAX_GOLOMB_Q: usize = 1_000_000;

// ─── Golomb-Rice (bit-array approach) ─────────────────────────────────────────

fn golomb_encode(data: &[u8], m: usize) -> Vec<u8> {
    assert!(m >= 2 && m.is_power_of_two(), "m must be power-of-2 >= 2");
    let k = m.trailing_zeros() as usize;
    let mut bits: Vec<u8> = Vec::with_capacity(data.len() * 10);
    for &byte in data {
        let q = (byte as usize) >> k;
        let r = (byte as usize) & (m - 1);
        for _ in 0..q { bits.push(1); }
        bits.push(0);
        for i in (0..k).rev() { bits.push(((r >> i) & 1) as u8); }
    }
    let out_len = (bits.len() + 7) / 8;
    let mut out = vec![0u8; out_len];
    for (i, &b) in bits.iter().enumerate() {
        if b == 1 { out[i >> 3] |= 0x80 >> (i & 7); }
    }
    out
}

fn golomb_decode(data: &[u8], m: usize) -> Result<Vec<u8>, &'static str> {
    let k = m.trailing_zeros() as usize;
    let total_bits = data.len() * 8;
    let read_bit = |pos: usize| -> u8 { (data[pos >> 3] >> (7 - (pos & 7))) & 1 };

    let mut result = Vec::new();
    let mut i = 0;
    while i < total_bits {
        let mut q = 0usize;
        while i < total_bits && read_bit(i) == 1 {
            q += 1; i += 1;
            if q > MAX_GOLOMB_Q { return Err("[GRG] Golomb Q overflow — malicious input"); }
        }
        if i < total_bits && read_bit(i) == 0 { i += 1; }
        if i + k > total_bits { break; }
        let mut r = 0usize;
        for j in 0..k { r = (r << 1) | read_bit(i + j) as usize; }
        result.push((q * m + r) as u8);
        i += k;
    }
    Ok(result)
}

// ─── HMAC-SHA256 shard integrity ─────────────────────────────────────────────

fn golay_encode_with_hmac(data: &[u8], hmac_key: &[u8]) -> Vec<u8> {
    let encoded = golay_encode(data);
    let mut mac = Hmac::<Sha256>::new_from_slice(hmac_key)
        .expect("HMAC key valid");
    mac.update(&encoded);
    let full = mac.finalize().into_bytes();
    let checksum = &full[..HMAC_LEN];
    let mut out = encoded.clone();
    out.extend_from_slice(checksum);
    out
}

fn golay_decode_with_hmac(data: &[u8], hmac_key: &[u8]) -> Result<Vec<u8>, &'static str> {
    if data.len() < HMAC_LEN { return Err("[GRG] Shard too short"); }
    let (encoded, checksum) = data.split_at(data.len() - HMAC_LEN);
    let mut mac = Hmac::<Sha256>::new_from_slice(hmac_key)
        .expect("HMAC key valid");
    mac.update(encoded);
    let full = mac.finalize().into_bytes();
    let expected = &full[..HMAC_LEN];
    if checksum != expected { return Err("[GRG] HMAC mismatch — tamper detected"); }
    let decoded = golay_decode(encoded)?;
    if decoded.uncorrectable { return Err("[GRG] Uncorrectable Golay errors"); }
    Ok(decoded.data)
}

// ─── Public GRG API ──────────────────────────────────────────────────────────

pub struct GrgPipeline;

impl GrgPipeline {
    /// Encode: Golomb → RS(4+2) → Golay+HMAC → 6 shards
    pub fn encode(
        data: &[u8],
        chain_id: u64,
        pool_address: &str,
    ) -> Result<GrgShards, &'static str> {
        if data.is_empty() { return Err("[GRG] Empty input"); }
        const M: usize = 16;
        let compressed = golomb_encode(data, M);
        // Prepend original length (4 bytes big-endian)
        let mut with_len = vec![0u8; 4 + compressed.len()];
        let len = data.len() as u32;
        with_len[0] = (len >> 24) as u8;
        with_len[1] = (len >> 16) as u8;
        with_len[2] = (len >> 8) as u8;
        with_len[3] = len as u8;
        with_len[4..].copy_from_slice(&compressed);

        let shards = rs_encode(&with_len, DATA_SHARDS, PARITY_SHARDS);
        let hmac_key = derive_hmac_key(chain_id, pool_address);

        Ok(shards.iter()
            .map(|s| golay_encode_with_hmac(s, &hmac_key))
            .collect())
    }

    /// Decode and verify 6 shards back to original data
    pub fn decode(
        shards: &GrgShards,
        original_len: usize,
        chain_id: u64,
        pool_address: &str,
    ) -> Result<Vec<u8>, &'static str> {
        let hmac_key = derive_hmac_key(chain_id, pool_address);
        let decoded_shards: Vec<Option<Vec<u8>>> = shards.iter()
            .map(|s| golay_decode_with_hmac(s, &hmac_key).ok())
            .collect();

        let with_len = rs_decode(&decoded_shards, DATA_SHARDS, PARITY_SHARDS)?;
        if with_len.len() < 4 { return Err("[GRG] RS output too short"); }

        let stored_len = u32::from_be_bytes(with_len[..4].try_into().unwrap()) as usize;
        let compressed = &with_len[4..];
        let decompressed = golomb_decode(compressed, 16)?;
        let final_data: Vec<u8> = decompressed.into_iter().take(stored_len).collect();

        if final_data.len() != original_len {
            return Err("[GRG] Length mismatch — corruption");
        }
        Ok(final_data)
    }

    /// Verify without returning data
    pub fn verify(data: &[u8], shards: &GrgShards, chain_id: u64, pool_address: &str) -> VerifyResult {
        match Self::decode(shards, data.len(), chain_id, pool_address) {
            Ok(decoded) => {
                let hmac_failures = shards.iter()
                    .filter(|s| golay_decode_with_hmac(s, &derive_hmac_key(chain_id, pool_address)).is_err())
                    .count();
                VerifyResult {
                    ok: decoded == data,
                    hmac_failures,
                    recovered: hmac_failures > 0,
                }
            }
            Err(_) => VerifyResult { ok: false, hmac_failures: shards.len(), recovered: false },
        }
    }
}

pub struct VerifyResult {
    pub ok: bool,
    pub hmac_failures: usize,
    pub recovered: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    const CID: u64 = 8453;
    const POOL: &str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    #[test] fn test_roundtrip() {
        let data = b"Helm TTT PoT GRG pipeline test";
        let shards = GrgPipeline::encode(data, CID, POOL).unwrap();
        assert_eq!(shards.len(), 6);
        let decoded = GrgPipeline::decode(&shards, data.len(), CID, POOL).unwrap();
        assert_eq!(decoded, data);
    }
    #[test] fn test_wrong_chain_rejected() {
        let data = b"test";
        let shards = GrgPipeline::encode(data, CID, POOL).unwrap();
        assert!(GrgPipeline::decode(&shards, data.len(), 1, POOL).is_err());
    }
    #[test] fn test_tamper_detected() {
        let data = b"tamper test";
        let mut shards = GrgPipeline::encode(data, CID, POOL).unwrap();
        shards[0][3] ^= 0xFF; shards[1][3] ^= 0xFF; shards[2][3] ^= 0xFF;
        assert!(GrgPipeline::decode(&shards, data.len(), CID, POOL).is_err());
    }
}

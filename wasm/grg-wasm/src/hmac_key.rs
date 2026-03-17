//! HMAC key derivation: keccak256(abi.encode(chain_id, pool_address))
//! No default key — chainId + poolAddress are always required.

use tiny_keccak::{Hasher, Keccak};

/// Derive a 32-byte HMAC key from chain_id + pool_address.
/// Matches OpenTTT's GrgForward.deriveHmacKey() exactly.
pub fn derive_hmac_key(chain_id: u64, pool_address: &str) -> [u8; 32] {
    // ABI encode: uint256(chain_id) ++ address(pool) = 32 + 32 bytes
    let mut encoded = [0u8; 64];
    // uint256 big-endian in 32 bytes
    let chain_bytes = chain_id.to_be_bytes();
    encoded[24..32].copy_from_slice(&chain_bytes);
    // address: 20 bytes, right-aligned in 32-byte slot
    let addr = pool_address.trim_start_matches("0x");
    if addr.len() == 40 {
        let addr_bytes = hex::decode(addr).unwrap_or_default();
        encoded[44..64].copy_from_slice(&addr_bytes);
    }

    let mut k = Keccak::v256();
    k.update(&encoded);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_key_derivation_non_empty() {
        let k1 = derive_hmac_key(8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        let k2 = derive_hmac_key(1,    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        assert_ne!(k1, k2, "Different chain IDs must produce different keys");
        assert_ne!(k1, [0u8; 32], "Key must not be all zeros");
    }
}

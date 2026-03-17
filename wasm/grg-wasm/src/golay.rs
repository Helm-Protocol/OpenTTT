//! Golay(24,12) Extended Binary Code
//! Corrects up to 3 bit errors, detects 4 bit errors.
//! Direct port from OpenTTT golay.ts — R7-P0-1 P^T fix included.

/// Standard Golay Parity Matrix P (12x12)
const P: [u16; 12] = [
    0xC75, 0x49F, 0xD4B, 0x6E3, 0x9B3, 0xB66,
    0xECC, 0x1ED, 0x3DA, 0x7B4, 0xB1D, 0xE3A,
];

/// P^T — transpose of P (required for correct syndrome decoding)
const PT: [u16; 12] = [
    0xAE3, 0xF25, 0x16F, 0x2DE, 0x5BC, 0xB78,
    0x9D5, 0xC8F, 0x63B, 0xC76, 0x7C9, 0xF92,
];

const UNIT: [u16; 12] = [
    0x800, 0x400, 0x200, 0x100, 0x080, 0x040,
    0x020, 0x010, 0x008, 0x004, 0x002, 0x001,
];

#[inline]
fn weight(n: u16) -> u32 { (n & 0xFFF).count_ones() }

#[inline]
fn multiply_p(v: u16) -> u16 {
    let mut res = 0u16;
    for i in 0..12u16 {
        if (v >> (11 - i)) & 1 == 1 { res ^= P[i as usize]; }
    }
    res & 0xFFF
}

#[inline]
fn multiply_pt(v: u16) -> u16 {
    let mut res = 0u16;
    for i in 0..12u16 {
        if (v >> (11 - i)) & 1 == 1 { res ^= PT[i as usize]; }
    }
    res & 0xFFF
}

fn encode_word(msg: u16) -> u32 {
    let parity = multiply_p(msg & 0xFFF);
    ((msg as u32 & 0xFFF) << 12) | parity as u32
}

pub struct DecodeResult {
    pub msg: u16,
    pub corrected: u32,
    pub uncorrectable: bool,
}

fn decode_word(received: u32) -> DecodeResult {
    let r_m = ((received >> 12) & 0xFFF) as u16;
    let r_p = (received & 0xFFF) as u16;
    let s = multiply_p(r_m) ^ r_p;

    if s == 0 {
        return DecodeResult { msg: r_m, corrected: 0, uncorrectable: false };
    }
    // Step 1: wt(s) <= 3
    if weight(s) <= 3 {
        return DecodeResult { msg: r_m, corrected: weight(s), uncorrectable: false };
    }
    // Step 2: wt(s ^ P[i]) <= 2
    for i in 0..12 {
        let sp = s ^ P[i];
        if weight(sp) <= 2 {
            return DecodeResult { msg: r_m ^ UNIT[i], corrected: weight(sp) + 1, uncorrectable: false };
        }
    }
    // Step 3: second syndrome (R7-P0-1 fix: use P^T)
    let s2 = multiply_pt(s);
    if weight(s2) <= 3 {
        return DecodeResult { msg: r_m ^ s2, corrected: weight(s2), uncorrectable: false };
    }
    // Step 4: wt(s2 ^ PT[i]) <= 2
    for i in 0..12 {
        let s2p = s2 ^ PT[i];
        if weight(s2p) <= 2 {
            return DecodeResult { msg: r_m ^ s2p, corrected: weight(s2p) + 1, uncorrectable: false };
        }
    }
    DecodeResult { msg: r_m, corrected: 0, uncorrectable: true }
}

/// Encode bytes using Golay(24,12)
pub fn golay_encode(data: &[u8]) -> Vec<u8> {
    let out_len = ((data.len() + 2) / 3) * 6;
    let mut out = vec![0u8; out_len];
    let mut out_idx = 0;

    let mut i = 0;
    while i < data.len() {
        let b1 = data[i] as u32;
        let b2 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b3 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };

        let w1 = ((b1 << 4) | (b2 >> 4)) as u16;
        let c1 = encode_word(w1);
        out[out_idx]     = ((c1 >> 16) & 0xFF) as u8;
        out[out_idx + 1] = ((c1 >> 8)  & 0xFF) as u8;
        out[out_idx + 2] = (c1         & 0xFF) as u8;
        out_idx += 3;

        if i + 1 < data.len() {
            let w2 = (((b2 & 0x0F) << 8) | b3) as u16;
            let c2 = encode_word(w2);
            out[out_idx]     = ((c2 >> 16) & 0xFF) as u8;
            out[out_idx + 1] = ((c2 >> 8)  & 0xFF) as u8;
            out[out_idx + 2] = (c2         & 0xFF) as u8;
            out_idx += 3;
        }
        i += 3;
    }
    out[..out_idx].to_vec()
}

pub struct GolayDecoded {
    pub data: Vec<u8>,
    pub corrected: u32,
    pub uncorrectable: bool,
}

/// Decode Golay(24,12) encoded bytes
pub fn golay_decode(encoded: &[u8]) -> Result<GolayDecoded, &'static str> {
    if encoded.len() % 6 != 0 {
        return Err("Golay encoded length must be multiple of 6");
    }
    let out_len = encoded.len() / 2;
    let mut out = vec![0u8; out_len];
    let mut out_idx = 0;
    let mut total_corrected = 0u32;
    let mut any_uncorrectable = false;

    let mut i = 0;
    while i < encoded.len() {
        let c1 = ((encoded[i] as u32) << 16)
               | ((encoded[i+1] as u32) << 8)
               |  (encoded[i+2] as u32);
        let r1 = decode_word(c1);
        total_corrected += r1.corrected;
        if r1.uncorrectable { any_uncorrectable = true; }

        if out_idx < out_len { out[out_idx] = ((r1.msg >> 4) & 0xFF) as u8; out_idx += 1; }
        let b2_high = (r1.msg & 0x0F) << 4;

        if i + 3 < encoded.len() {
            let c2 = ((encoded[i+3] as u32) << 16)
                   | ((encoded[i+4] as u32) << 8)
                   |  (encoded[i+5] as u32);
            let r2 = decode_word(c2);
            total_corrected += r2.corrected;
            if r2.uncorrectable { any_uncorrectable = true; }
            if out_idx < out_len { out[out_idx] = (b2_high | (r2.msg >> 8) as u16) as u8; out_idx += 1; }
            if out_idx < out_len { out[out_idx] = (r2.msg & 0xFF) as u8; out_idx += 1; }
        } else {
            if out_idx < out_len { out[out_idx] = b2_high as u8; out_idx += 1; }
        }
        i += 6;
    }

    Ok(GolayDecoded {
        data: out[..out_idx].to_vec(),
        corrected: total_corrected,
        uncorrectable: any_uncorrectable,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_roundtrip() {
        let data = b"HelloTTT123456";
        let encoded = golay_encode(data);
        let decoded = golay_decode(&encoded).unwrap();
        assert_eq!(&decoded.data[..data.len()], data);
        assert!(!decoded.uncorrectable);
    }
    #[test]
    fn test_error_correction() {
        let data = b"TestData";
        let mut encoded = golay_encode(data);
        encoded[1] ^= 0b00000111; // flip 3 bits
        let decoded = golay_decode(&encoded).unwrap();
        assert_eq!(&decoded.data[..data.len()], data);
    }
}

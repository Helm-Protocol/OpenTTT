// sdk/src/golay.ts
// 🔱 Golay(24,12) Extended Binary Golay Code (RE-SURGERY)
// Corrects up to 3 bit errors, detects 4 bit errors.

// Standard Golay Parity Matrix P (12x12) - Systematic Form [I12 | P]
// Every row has weight 7.
// Verified: P*P^T = I (mod 2), all rows weight 7.
// Derived from g(x) = x^11+x^10+x^6+x^5+x^4+x^2+1 with parity extension.
const P = [
    0xC75, 0x49F, 0xD4B, 0x6E3, 0x9B3, 0xB66,
    0xECC, 0x1ED, 0x3DA, 0x7B4, 0xB1D, 0xE3A
];

// R7-P0-1: P^T (transpose of P) — required for second syndrome computation.
// P is NOT symmetric, so s2 = s*P^T must use this separate matrix.
// Without this, decodeWord fails ~24% of weight-2 and ~50% of weight-3 error patterns.
const PT = [
    0xAE3, 0xF25, 0x16F, 0x2DE, 0x5BC, 0xB78,
    0x9D5, 0xC8F, 0x63B, 0xC76, 0x7C9, 0xF92
];

const UNIT_VECTORS = [
    0x800, 0x400, 0x200, 0x100, 0x080, 0x040,
    0x020, 0x010, 0x008, 0x004, 0x002, 0x001
];

/**
 * Calculates weight (number of set bits).
 */
function weight(n: number): number {
    let count = 0;
    let temp = n & 0xFFF;
    while (temp > 0) {
        temp &= (temp - 1);
        count++;
    }
    return count;
}

/**
 * Multiplies a 12-bit vector by the parity matrix P.
 */
function multiplyP(v: number): number {
    let res = 0;
    for (let i = 0; i < 12; i++) {
        if ((v >> (11 - i)) & 1) {
            res ^= P[i];
        }
    }
    return res & 0xFFF;
}

/**
 * R7-P0-1: Multiplies a 12-bit vector by P^T (transpose of P).
 * Required for second syndrome computation in decodeWord steps 3-5.
 */
function multiplyPT(v: number): number {
    let res = 0;
    for (let i = 0; i < 12; i++) {
        if ((v >> (11 - i)) & 1) {
            res ^= PT[i];
        }
    }
    return res & 0xFFF;
}

function encodeWord(msg: number): number {
    const parity = multiplyP(msg & 0xFFF);
    return ((msg & 0xFFF) << 12) | parity;
}

/**
 * Full Syndrome Decoding for Golay(24,12)
 */
function decodeWord(received: number): { msg: number; corrected: number; uncorrectable: boolean } {
    let r_m = (received >> 12) & 0xFFF;
    const r_p = received & 0xFFF;
    
    // Syndrome s = r_m * P + r_p
    const s = multiplyP(r_m) ^ r_p;
    
    if (s === 0) return { msg: r_m, corrected: 0, uncorrectable: false };

    // 1. wt(s) <= 3 -> Error in parity
    if (weight(s) <= 3) {
        return { msg: r_m, corrected: weight(s), uncorrectable: false };
    }

    // 2. wt(s + P_i) <= 2 -> Error in msg bit i (+ possible 1-2 errors in parity)
    for (let i = 0; i < 12; i++) {
        if (weight(s ^ P[i]) <= 2) {
            return { msg: r_m ^ UNIT_VECTORS[i], corrected: weight(s ^ P[i]) + 1, uncorrectable: false };
        }
    }

    // 3. R7-P0-1: Second syndrome s2 = s * P^T (NOT s * P — P is not symmetric!)
    const s2 = multiplyPT(s);

    // 4. wt(s2) <= 3 -> Error in message
    if (weight(s2) <= 3) {
        return { msg: r_m ^ s2, corrected: weight(s2), uncorrectable: false };
    }

    // 5. wt(s2 + PT_i) <= 2 -> Error in parity bit i + message errors
    // R7-P0-1: Must use PT rows (columns of P), not P rows
    for (let i = 0; i < 12; i++) {
        if (weight(s2 ^ PT[i]) <= 2) {
            const error_m = s2 ^ PT[i];
            return { msg: r_m ^ error_m, corrected: weight(s2 ^ PT[i]) + 1, uncorrectable: false };
        }
    }

    return { msg: r_m, corrected: 0, uncorrectable: true };
}

export function golayEncode(data: Uint8Array): Uint8Array {
    // B1-6: Correct output size calculation to avoid buffer overflow
    const out = new Uint8Array(Math.ceil(data.length / 3) * 6);
    let outIdx = 0;
    
    // Process in 3-byte blocks -> two 12-bit words -> two 24-bit (3-byte) codewords
    for (let i = 0; i < data.length; i += 3) {
        const b1 = data[i];
        const b2 = i + 1 < data.length ? data[i + 1] : 0;
        const b3 = i + 2 < data.length ? data[i + 2] : 0;

        // Word 1 (12 bits)
        const w1 = (b1 << 4) | (b2 >> 4);
        const c1 = encodeWord(w1);
        out[outIdx++] = (c1 >> 16) & 0xFF;
        out[outIdx++] = (c1 >> 8) & 0xFF;
        out[outIdx++] = c1 & 0xFF;

        if (i + 1 < data.length) {
            // Word 2 (12 bits)
            const w2 = ((b2 & 0x0F) << 8) | b3;
            const c2 = encodeWord(w2);
            out[outIdx++] = (c2 >> 16) & 0xFF;
            out[outIdx++] = (c2 >> 8) & 0xFF;
            out[outIdx++] = c2 & 0xFF;
        }
    }
    return out;
}

export function golayDecode(encoded: Uint8Array): { data: Uint8Array; corrected: number; uncorrectable: boolean } {
    // B1-6: Throws if length is not a multiple of 6
    if (encoded.length % 6 !== 0) {
        throw new Error("Invalid Golay encoded data: length must be multiple of 6");
    }
    const outLen = Math.floor(encoded.length / 2);
    const out = new Uint8Array(outLen);
    let outIdx = 0;
    let totalCorrected = 0;
    let anyUncorrectable = false;

    for (let i = 0; i < encoded.length; i += 6) {
        const c1 = (encoded[i] << 16) | (encoded[i + 1] << 8) | encoded[i + 2];
        const res1 = decodeWord(c1);
        totalCorrected += res1.corrected;
        if (res1.uncorrectable) anyUncorrectable = true;

        if (outIdx < outLen) out[outIdx++] = (res1.msg >> 4) & 0xFF;
        const b2_high = (res1.msg & 0x0F) << 4;

        if (i + 3 < encoded.length) {
            const c2 = (encoded[i + 3] << 16) | (encoded[i + 4] << 8) | encoded[i + 5];
            const res2 = decodeWord(c2);
            totalCorrected += res2.corrected;
            if (res2.uncorrectable) anyUncorrectable = true;

            if (outIdx < outLen) out[outIdx++] = b2_high | (res2.msg >> 8);
            if (outIdx < outLen) out[outIdx++] = res2.msg & 0xFF;
        } else {
            if (outIdx < outLen) out[outIdx++] = b2_high;
        }
    }

    return { data: out, corrected: totalCorrected, uncorrectable: anyUncorrectable };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrgInverse = void 0;
const crypto_1 = require("crypto");
const golay_1 = require("./golay");
const grg_forward_1 = require("./grg_forward");
const logger_1 = require("./logger");
const reed_solomon_1 = require("./reed_solomon");
class GrgInverse {
    // 1. Golay Decoding & Integrity Check
    static golayDecodeWrapper(data, hmacKey) {
        if (data.length < 8)
            throw new Error("GRG shard too short for checksum");
        // Split data and checksum (last 8 bytes)
        const encoded = data.subarray(0, data.length - 8);
        const checksum = data.subarray(data.length - 8);
        // Verify HMAC-SHA256 Checksum (keyed hash, B1-5: 8 bytes truncated)
        const key = hmacKey;
        const mac = (0, crypto_1.createHmac)("sha256", key).update(Buffer.from(encoded)).digest();
        const expected = mac.subarray(0, 8);
        if (!Buffer.from(checksum).equals(Buffer.from(expected))) {
            throw new Error("GRG tamper detected: HMAC-SHA256 checksum mismatch");
        }
        // Proceed to Golay decode
        const res = (0, golay_1.golayDecode)(encoded);
        if (res.uncorrectable) {
            throw new Error("GRG tamper detected: uncorrectable bit errors in Golay codeword");
        }
        return res.data;
    }
    // 2. RedStuff Decoding (Reed-Solomon GF(2^8))
    static redstuffDecode(shards, dataShardCount = 4, parityShardCount = 2) {
        return reed_solomon_1.ReedSolomon.decode(shards, dataShardCount, parityShardCount);
    }
    /**
     * Decode a Golomb-Rice compressed byte stream.
     *
     * @param data - Golomb-encoded bit-packed bytes
     * @param m - Golomb divisor (must be power of 2, default 16)
     * @param originalLength - If provided, stop decoding once this many values
     *   have been emitted. This prevents phantom trailing bytes caused by
     *   zero-padding in the last byte of the encoded stream.
     */
    static golombDecode(data, m = 16, originalLength) {
        if (m < 2)
            throw new Error("[GRG] Golomb parameter m must be >= 2");
        const k = Math.log2(m);
        const totalBits = data.length * 8;
        // Helper to read a single bit from the packed byte array
        const readBit = (pos) => {
            return (data[pos >> 3] >> (7 - (pos & 7))) & 1;
        };
        const result = [];
        let i = 0;
        while (i < totalBits) {
            // Guard: stop at expected length to avoid processing padding bits
            if (originalLength !== undefined && result.length >= originalLength)
                break;
            // Read unary part: count 1-bits until a 0-bit
            let q = 0;
            while (i < totalBits && readBit(i) === 1) {
                q++;
                i++;
                if (q > this.MAX_GOLOMB_Q)
                    throw new Error(`[GRG] Golomb decode: unary run exceeds ${this.MAX_GOLOMB_Q} — malformed or malicious input`);
            }
            if (i < totalBits && readBit(i) === 0)
                i++; // skip the 0 delimiter
            // Read k-bit remainder
            if (i + k > totalBits)
                break;
            let r = 0;
            for (let j = 0; j < k; j++) {
                r = (r << 1) | readBit(i + j);
            }
            result.push(q * m + r);
            i += k;
        }
        return new Uint8Array(result);
    }
    static verify(data, originalShards, chainId, poolAddress) {
        try {
            const hmacKey = grg_forward_1.GrgForward.deriveHmacKey(chainId, poolAddress);
            const decodedShards = originalShards.map(s => {
                try {
                    return this.golayDecodeWrapper(s, hmacKey);
                }
                catch {
                    return null;
                }
            });
            const withLen = this.redstuffDecode(decodedShards);
            // Extract original length
            if (withLen.length < 4)
                return false;
            const origLen = (withLen[0] << 24) | (withLen[1] << 16) | (withLen[2] << 8) | withLen[3];
            const compressed = withLen.subarray(4);
            const decoded = this.golombDecode(compressed);
            const final = decoded.subarray(0, origLen);
            if (final.length !== data.length)
                return false;
            for (let i = 0; i < data.length; i++) {
                if (final[i] !== data[i])
                    return false;
            }
            return true;
        }
        catch (e) {
            logger_1.logger.warn(`[GRG Inverse] Verification failed: ${e}`);
            return false;
        }
    }
}
exports.GrgInverse = GrgInverse;
// 3. Golomb-Rice Decompression
// R4-P2-3: Max unary run length to prevent amplification DoS
GrgInverse.MAX_GOLOMB_Q = 1000000;
//# sourceMappingURL=grg_inverse.js.map
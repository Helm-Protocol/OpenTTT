"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrgForward = void 0;
const crypto_1 = require("crypto");
const ethers_1 = require("ethers");
const golay_1 = require("./golay");
const reed_solomon_1 = require("./reed_solomon");
class GrgForward {
    /**
     * Golomb-Rice encoding.
     *
     * Golomb-Rice is optimal for small-value biased distributions (e.g., timestamp deltas).
     * For uniformly distributed data (random bytes), expect ~50% expansion.
     * The primary purpose in the GRG pipeline is structured encoding for error correction,
     * not compression.
     *
     * @param data  Raw bytes to encode.
     * @param m     Golomb divisor (must be a power of 2, default 16).
     */
    static golombEncode(data, m = 16) {
        if (m < 2)
            throw new Error("[GRG] Golomb parameter m must be >= 2");
        const k = Math.log2(m);
        if (!Number.isInteger(k))
            throw new Error("M must be power of 2");
        const bits = [];
        for (const byte of data) {
            const q = Math.floor(byte / m);
            const r = byte % m;
            for (let i = 0; i < q; i++)
                bits.push(1);
            bits.push(0);
            for (let i = k - 1; i >= 0; i--)
                bits.push((r >> i) & 1);
        }
        const out = new Uint8Array(Math.ceil(bits.length / 8));
        for (let i = 0; i < bits.length; i++) {
            if (bits[i])
                out[i >> 3] |= (0x80 >> (i & 7));
        }
        return out;
    }
    // 2. RedStuff Erasure Coding (Reed-Solomon GF(2^8))
    static redstuffEncode(data, shards = 4, parity = 2) {
        return reed_solomon_1.ReedSolomon.encode(data, shards, parity);
    }
    /**
     * Derives an HMAC key from GRG payload context (chainId + poolAddress).
     * Both parameters are required — no default key fallback.
     */
    static deriveHmacKey(chainId, poolAddress) {
        if (chainId === undefined || chainId === null || !poolAddress) {
            throw new Error("[GRG] chainId and poolAddress are required for HMAC key derivation. No default key is allowed.");
        }
        const packed = (0, ethers_1.keccak256)(ethers_1.AbiCoder.defaultAbiCoder().encode(["uint256", "address"], [chainId, poolAddress]));
        return Buffer.from(packed.slice(2), "hex"); // 32 bytes
    }
    // 3. Golay(24,12) Error Correction Encoding
    static golayEncodeWrapper(data, hmacKey) {
        const encoded = (0, golay_1.golayEncode)(data);
        // 🔱 Integrity: Append 8-byte HMAC-SHA256 of the encoded shard (keyed hash)
        const key = hmacKey;
        const mac = (0, crypto_1.createHmac)("sha256", key).update(Buffer.from(encoded)).digest();
        const checksum = mac.subarray(0, 8);
        const final = new Uint8Array(encoded.length + 8);
        final.set(encoded);
        final.set(checksum, encoded.length);
        return final;
    }
    static encode(data, chainId, poolAddress) {
        // R3-P0-3: Reject empty input — roundtrip breaks ([] → [0])
        if (data.length === 0) {
            throw new Error("[GRG] Cannot encode empty input — roundtrip identity violation");
        }
        const compressed = this.golombEncode(data);
        // Prepend original length (4 bytes, big-endian) for exact roundtrip
        const withLen = new Uint8Array(4 + compressed.length);
        withLen[0] = (data.length >> 24) & 0xFF;
        withLen[1] = (data.length >> 16) & 0xFF;
        withLen[2] = (data.length >> 8) & 0xFF;
        withLen[3] = data.length & 0xFF;
        withLen.set(compressed, 4);
        const shards = this.redstuffEncode(withLen);
        const hmacKey = this.deriveHmacKey(chainId, poolAddress);
        return shards.map(s => this.golayEncodeWrapper(s, hmacKey));
    }
}
exports.GrgForward = GrgForward;
//# sourceMappingURL=grg_forward.js.map
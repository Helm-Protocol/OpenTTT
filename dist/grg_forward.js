"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrgForward = void 0;
const crypto_1 = require("crypto");
const ethers_1 = require("ethers");
const golay_1 = require("./golay");
const reed_solomon_1 = require("./reed_solomon");
class GrgForward {
    // 1. Golomb-Rice Compression
    static golombEncode(data, m = 16) {
        if (m < 2)
            throw new Error("[GRG] Golomb parameter m must be >= 2");
        const k = Math.log2(m);
        if (!Number.isInteger(k))
            throw new Error("M must be power of 2");
        let bits = "";
        for (const byte of data) {
            const q = Math.floor(byte / m);
            const r = byte % m;
            bits += "1".repeat(q) + "0" + r.toString(2).padStart(k, "0");
        }
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
            bytes.push(parseInt(bits.substring(i, i + 8).padEnd(8, "0"), 2));
        }
        return new Uint8Array(bytes);
    }
    // 2. RedStuff Erasure Coding (Reed-Solomon GF(2^8))
    static redstuffEncode(data, shards = 4, parity = 2) {
        return reed_solomon_1.ReedSolomon.encode(data, shards, parity);
    }
    /**
     * Derives an HMAC key from GRG payload context (chainId + poolAddress).
     * Falls back to a static domain-separation key when no context is provided.
     */
    static deriveHmacKey(chainId, poolAddress) {
        if (chainId !== undefined && poolAddress) {
            const packed = (0, ethers_1.keccak256)(ethers_1.AbiCoder.defaultAbiCoder().encode(["uint256", "address"], [chainId, poolAddress]));
            return Buffer.from(packed.slice(2), "hex"); // 32 bytes
        }
        // Default domain-separation key when no context is available
        return Buffer.from("grg-integrity-hmac-default-key-v1");
    }
    // 3. Golay(24,12) Error Correction Encoding
    static golayEncodeWrapper(data, hmacKey) {
        const encoded = (0, golay_1.golayEncode)(data);
        // 🔱 Integrity: Append 8-byte HMAC-SHA256 of the encoded shard (keyed hash)
        const key = hmacKey || this.deriveHmacKey();
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

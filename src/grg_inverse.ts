import { createHash } from "crypto";
import { golayDecode } from "./golay";
import { logger } from "./logger";
import { ReedSolomon } from "./reed_solomon";

export class GrgInverse {
  
  // 1. Golay Decoding & Integrity Check 🔱
  static golayDecodeWrapper(data: Uint8Array): Uint8Array {
    if (data.length < 8) throw new Error("GRG shard too short for checksum");

    // Split data and checksum (last 8 bytes)
    const encoded = data.subarray(0, data.length - 8);
    const checksum = data.subarray(data.length - 8);

    // Verify SHA-256 Checksum (B1-5: 4 -> 8 bytes)
    const hash = createHash("sha256").update(Buffer.from(encoded)).digest();
    const expected = hash.subarray(0, 8);

    if (!Buffer.from(checksum).equals(Buffer.from(expected))) {
      throw new Error("GRG tamper detected: SHA-256 checksum mismatch");
    }

    // Proceed to Golay decode
    const res = golayDecode(encoded);
    if (res.uncorrectable) {
      throw new Error("GRG tamper detected: uncorrectable bit errors in Golay codeword");
    }
    return res.data;
  }

  // 2. RedStuff Decoding (Reed-Solomon GF(2^8))
  static redstuffDecode(shards: (Uint8Array | null)[], dataShardCount: number = 4, parityShardCount: number = 2): Uint8Array {
    return ReedSolomon.decode(shards, dataShardCount, parityShardCount);
  }

  // 3. Golomb-Rice Decompression
  // R4-P2-3: Max unary run length to prevent amplification DoS
  private static readonly MAX_GOLOMB_Q = 1_000_000;

  static golombDecode(data: Uint8Array, m: number = 16): Uint8Array {
    if (m < 2) throw new Error("[GRG] Golomb parameter m must be >= 2");
    const k = Math.log2(m);
    let bits = "";
    for (const byte of data) {
      bits += byte.toString(2).padStart(8, "0");
    }

    const result = [];
    let i = 0;
    while (i < bits.length) {
      let q = 0;
      while (bits[i] === "1") {
        q++;
        i++;
        if (q > this.MAX_GOLOMB_Q) throw new Error(`[GRG] Golomb decode: unary run exceeds ${this.MAX_GOLOMB_Q} — malformed or malicious input`);
      }
      if (bits[i] === "0") i++;
      
      const rStr = bits.substring(i, i + k);
      if (rStr.length < k) break;
      const r = parseInt(rStr, 2);
      result.push(q * m + r);
      i += k;
    }
    return new Uint8Array(result);
  }

  static verify(data: Uint8Array, originalShards: Uint8Array[]): boolean {
    try {
      const decodedShards: (Uint8Array | null)[] = originalShards.map(s => {
        try {
          return this.golayDecodeWrapper(s);
        } catch {
          return null;
        }
      });
      const withLen = this.redstuffDecode(decodedShards);
      
      // Extract original length
      if (withLen.length < 4) return false;
      const origLen = (withLen[0] << 24) | (withLen[1] << 16) | (withLen[2] << 8) | withLen[3];
      const compressed = withLen.subarray(4);
      
      const decoded = this.golombDecode(compressed);
      const final = decoded.subarray(0, origLen);
      
      if (final.length !== data.length) return false;
      for (let i = 0; i < data.length; i++) {
        if (final[i] !== data[i]) return false;
      }
      return true;
    } catch (e) {
      logger.warn(`[GRG Inverse] Verification failed: ${e}`);
      return false;
    }
  }
}

// sdk/src/grg_inverse.ts
import { createHmac } from "crypto";
import { golayDecode } from "./golay";
import { GrgForward } from "./grg_forward";
import { logger } from "./logger";
import { ReedSolomon } from "./reed_solomon";

export class GrgInverse {
  private static readonly MAX_GOLOMB_Q = 1000000;

  static golayDecodeWrapper(data: Uint8Array, hmacKey: Buffer): Uint8Array {
    if (data.length < 8) throw new Error("GRG shard too short for checksum");
    const encoded = data.subarray(0, data.length - 8);
    const checksum = data.subarray(data.length - 8);
    const mac = createHmac("sha256", hmacKey).update(Buffer.from(encoded)).digest();
    const expected = mac.subarray(0, 8);
    if (!Buffer.from(checksum).equals(Buffer.from(expected))) {
      throw new Error("GRG tamper detected: HMAC-SHA256 checksum mismatch");
    }
    const res = golayDecode(encoded);
    if (res.uncorrectable) {
      throw new Error("GRG tamper detected: uncorrectable bit errors in Golay codeword");
    }
    return res.data;
  }

  static redstuffDecode(shards: (Uint8Array | null)[], dataShardCount = 4, parityShardCount = 2): Uint8Array {
    return ReedSolomon.decode(shards, dataShardCount, parityShardCount);
  }

  static golombDecode(data: Uint8Array, m = 16, originalLength?: number): Uint8Array {
    if (m < 2) throw new Error("[GRG] Golomb parameter m must be >= 2");
    const k = Math.log2(m);
    const totalBits = data.length * 8;
    const readBit = (pos: number) => (data[pos >> 3] >> (7 - (pos & 7))) & 1;
    const result: number[] = [];
    let i = 0;

    while (i < totalBits) {
      if (originalLength !== undefined && result.length >= originalLength) break;
      let q = 0;
      while (i < totalBits && readBit(i) === 1) {
        q++;
        i++;
        if (q > this.MAX_GOLOMB_Q)
          throw new Error(`[GRG] Golomb decode: unary run exceeds ${this.MAX_GOLOMB_Q} — malformed or malicious input`);
      }
      if (i < totalBits && readBit(i) === 0) i++;
      if (i + k > totalBits) break;
      let r = 0;
      for (let j = 0; j < k; j++) r = (r << 1) | readBit(i + j);
      result.push(q * m + r);
      i += k;
    }
    return new Uint8Array(result);
  }

  static verify(data: Uint8Array, originalShards: Uint8Array[], chainId: number, poolAddress: string): boolean {
    try {
      const hmacKey = GrgForward.deriveHmacKey(chainId, poolAddress);
      const decodedShards = originalShards.map(s => {
        try { return this.golayDecodeWrapper(s, hmacKey); }
        catch { return null; }
      });
      const withLen = this.redstuffDecode(decodedShards);
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

// sdk/src/grg_forward.ts
import { createHmac } from "crypto";
import { keccak256, AbiCoder } from "ethers";
import { golayEncode } from "./golay";
import { ReedSolomon } from "./reed_solomon";

export class GrgForward {
  static golombEncode(data: Uint8Array, m = 16): Uint8Array {
    if (m < 2) throw new Error("[GRG] Golomb parameter m must be >= 2");
    const k = Math.log2(m);
    if (!Number.isInteger(k)) throw new Error("M must be power of 2");

    const bits: number[] = [];
    for (const byte of data) {
      const q = Math.floor(byte / m);
      const r = byte % m;
      for (let i = 0; i < q; i++) bits.push(1);
      bits.push(0);
      for (let i = k - 1; i >= 0; i--) bits.push((r >> i) & 1);
    }

    const out = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) out[i >> 3] |= (0x80 >> (i & 7));
    }
    return out;
  }

  static redstuffEncode(data: Uint8Array, shards = 4, parity = 2): Uint8Array[] {
    return ReedSolomon.encode(data, shards, parity);
  }

  static deriveHmacKey(chainId: number, poolAddress: string): Buffer {
    if (chainId === undefined || chainId === null || !poolAddress) {
      throw new Error("[GRG] chainId and poolAddress are required for HMAC key derivation. No default key is allowed.");
    }
    const packed = keccak256(AbiCoder.defaultAbiCoder().encode(["uint256", "address"], [chainId, poolAddress]));
    return Buffer.from(packed.slice(2), "hex");
  }

  static golayEncodeWrapper(data: Uint8Array, hmacKey: Buffer): Uint8Array {
    const encoded = golayEncode(data);
    const mac = createHmac("sha256", hmacKey).update(Buffer.from(encoded)).digest();
    const checksum = mac.subarray(0, 8);
    const final = new Uint8Array(encoded.length + 8);
    final.set(encoded);
    final.set(checksum, encoded.length);
    return final;
  }

  static encode(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[] {
    if (data.length === 0) {
      throw new Error("[GRG] Cannot encode empty input — roundtrip identity violation");
    }
    const compressed = this.golombEncode(data);
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

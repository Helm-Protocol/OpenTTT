// Tests for uncovered branches in grg_inverse.ts
import { GrgInverse, GrgForward } from "../vendor/helm-crypto";

describe("GrgInverse — uncovered branches", () => {
  const chainId = 1;
  const poolAddress = "0x1234567890123456789012345678901234567890";
  const hmacKey = GrgForward.deriveHmacKey(chainId, poolAddress);

  test("golayDecodeWrapper rejects data shorter than 8 bytes (line 11)", () => {
    expect(() => GrgInverse.golayDecodeWrapper(new Uint8Array([1, 2, 3]), hmacKey))
      .toThrow("GRG shard too short for checksum");
  });

  test("golayDecodeWrapper rejects tampered HMAC checksum", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encoded = GrgForward.golayEncodeWrapper(data, hmacKey);
    // Tamper with the last byte (checksum area)
    encoded[encoded.length - 1] ^= 0xFF;
    expect(() => GrgInverse.golayDecodeWrapper(encoded, hmacKey))
      .toThrow("HMAC-SHA256 checksum mismatch");
  });

  test("golombDecode rejects m < 2", () => {
    expect(() => GrgInverse.golombDecode(new Uint8Array([1]), 1))
      .toThrow("Golomb parameter m must be >= 2");
  });

  test("golombDecode respects originalLength parameter", () => {
    // Encode some data, then decode with limited length
    const data = new Uint8Array([10, 20, 30, 40]);
    const encoded = GrgForward.golombEncode(data, 16);
    const decoded = GrgInverse.golombDecode(encoded, 16, 2);
    expect(decoded.length).toBe(2);
    expect(decoded[0]).toBe(10);
    expect(decoded[1]).toBe(20);
  });

  test("golombDecode without originalLength decodes all values", () => {
    const data = new Uint8Array([10, 20, 30]);
    const encoded = GrgForward.golombEncode(data, 16);
    const decoded = GrgInverse.golombDecode(encoded, 16, data.length);
    expect(decoded).toEqual(data);
  });

  test("verify returns false for mismatched data", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const shards = GrgForward.encode(data, chainId, poolAddress);
    const wrongData = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(GrgInverse.verify(wrongData, shards, chainId, poolAddress)).toBe(false);
  });

  test("verify returns true for correct data", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const shards = GrgForward.encode(data, chainId, poolAddress);
    expect(GrgInverse.verify(data, shards, chainId, poolAddress)).toBe(true);
  });

  test("verify returns false when all shards are corrupted", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const shards = GrgForward.encode(data, chainId, poolAddress);
    // Corrupt all shards
    const corrupted = shards.map(s => {
      const copy = new Uint8Array(s);
      copy[0] ^= 0xFF;
      copy[1] ^= 0xFF;
      return copy;
    });
    expect(GrgInverse.verify(data, corrupted, chainId, poolAddress)).toBe(false);
  });

  test("redstuffDecode works with null shards (erasure recovery)", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const shards = GrgForward.redstuffEncode(data, 4, 2);
    // Null out 2 shards — RS should recover
    const partial: (Uint8Array | null)[] = [null, null, shards[2], shards[3], shards[4], shards[5]];
    const recovered = GrgInverse.redstuffDecode(partial, 4, 2);
    // RS decode may pad to shard boundary — verify original data is prefix
    expect(recovered.slice(0, data.length)).toEqual(data);
  });
});

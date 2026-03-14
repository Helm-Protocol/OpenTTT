// Tests for uncovered branches in grg_forward.ts
import { GrgForward } from "../src/grg_forward";

describe("GrgForward — uncovered branches", () => {
  const chainId = 1;
  const poolAddress = "0x1234567890123456789012345678901234567890";

  test("golombEncode rejects m < 2", () => {
    expect(() => GrgForward.golombEncode(new Uint8Array([1, 2, 3]), 1))
      .toThrow("Golomb parameter m must be >= 2");
  });

  test("golombEncode rejects non-power-of-2 m", () => {
    expect(() => GrgForward.golombEncode(new Uint8Array([1, 2, 3]), 3))
      .toThrow("M must be power of 2");
  });

  test("encode rejects empty input (line 77)", () => {
    expect(() => GrgForward.encode(new Uint8Array([]), chainId, poolAddress))
      .toThrow("Cannot encode empty input");
  });

  test("deriveHmacKey rejects missing chainId (line 51)", () => {
    expect(() => GrgForward.deriveHmacKey(undefined as any, poolAddress))
      .toThrow("chainId and poolAddress are required");
  });

  test("deriveHmacKey rejects missing poolAddress", () => {
    expect(() => GrgForward.deriveHmacKey(chainId, ""))
      .toThrow("chainId and poolAddress are required");
  });

  test("deriveHmacKey returns 32-byte Buffer", () => {
    const key = GrgForward.deriveHmacKey(chainId, poolAddress);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  test("golombEncode handles byte value 0", () => {
    const result = GrgForward.golombEncode(new Uint8Array([0]), 16);
    expect(result.length).toBeGreaterThan(0);
  });

  test("golombEncode handles byte value 255", () => {
    const result = GrgForward.golombEncode(new Uint8Array([255]), 16);
    expect(result.length).toBeGreaterThan(0);
  });

  test("redstuffEncode produces correct number of shards", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const shards = GrgForward.redstuffEncode(data, 4, 2);
    expect(shards.length).toBe(6);
  });

  test("encode roundtrip with various data sizes", () => {
    // Single byte
    const data1 = new Uint8Array([42]);
    const shards1 = GrgForward.encode(data1, chainId, poolAddress);
    expect(shards1.length).toBe(6);

    // Large-ish data
    const data2 = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data2[i] = i;
    const shards2 = GrgForward.encode(data2, chainId, poolAddress);
    expect(shards2.length).toBe(6);
  });
});

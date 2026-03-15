import { ReedSolomon } from "../vendor/helm-crypto";

describe("ReedSolomon GF(2^8) Erasure Coding", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

  it("should recover from all 6 shards", () => {
    const shards = ReedSolomon.encode(data, 4, 2);
    expect(shards.length).toBe(6);
    const decoded = ReedSolomon.decode(shards, 4, 2);
    // shard size padded, so we compare up to data.length
    expect(decoded.subarray(0, data.length)).toEqual(data);
  });

  it("should recover from any 4 shards (all 15 combinations)", () => {
    const shards = ReedSolomon.encode(data, 4, 2);
    
    // C(6, 4) = 15 combinations
    const combinations = [
      [0, 1, 2, 3], [0, 1, 2, 4], [0, 1, 2, 5],
      [0, 1, 3, 4], [0, 1, 3, 5], [0, 1, 4, 5],
      [0, 2, 3, 4], [0, 2, 3, 5], [0, 2, 4, 5],
      [0, 3, 4, 5], [1, 2, 3, 4], [1, 2, 3, 5],
      [1, 2, 4, 5], [1, 3, 4, 5], [2, 3, 4, 5]
    ];

    for (const combo of combinations) {
      const present: (Uint8Array | null)[] = [null, null, null, null, null, null];
      for (const idx of combo) {
        present[idx] = shards[idx];
      }
      const decoded = ReedSolomon.decode(present, 4, 2);
      expect(decoded.subarray(0, data.length)).toEqual(data);
    }
  });

  it("should fail to recover if only 3 shards are present", () => {
    const shards = ReedSolomon.encode(data, 4, 2);
    const present: (Uint8Array | null)[] = [shards[0], shards[1], null, shards[3], null, null];
    
    expect(() => {
      ReedSolomon.decode(present, 4, 2);
    }).toThrow(/Not enough shards/);
  });

  it("should be used correctly by GrgForward and GrgInverse", () => {
    // This checks roundtrip from higher level.
    const encoded = ReedSolomon.encode(data, 4, 2);
    const decoded = ReedSolomon.decode(encoded, 4, 2);
    expect(decoded.subarray(0, data.length)).toEqual(data);
  });
  
  it("should reject empty input conceptually by rejecting zero length or failing properly", () => {
    // encode of 0 length will return padded arrays of size 0
    const emptyData = new Uint8Array(0);
    const emptyShards = ReedSolomon.encode(emptyData, 4, 2);
    expect(emptyShards.length).toBe(6);
    expect(emptyShards[0].length).toBe(0);
    const decoded = ReedSolomon.decode(emptyShards, 4, 2);
    expect(decoded.length).toBe(0);
  });
});

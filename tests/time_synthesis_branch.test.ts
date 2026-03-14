// Tests for uncovered branches in time_synthesis.ts
// Targets: HTTPSTimeSource, PoT verification edge cases, serialization, getFromSource
import { TimeSynthesis, HTTPSTimeSource, NTPSource } from "../src/time_synthesis";
import { ProofOfTime, TimeReading } from "../src/types";

describe("TimeSynthesis — uncovered branches", () => {

  describe("HTTPSTimeSource", () => {
    test("constructor stores name and url", () => {
      const src = new HTTPSTimeSource("test-https", "https://example.com/");
      expect(src.name).toBe("test-https");
    });
  });

  describe("NTPSource", () => {
    test("constructor stores name and host", () => {
      const src = new NTPSource("test-ntp", "pool.ntp.org", 123);
      expect(src.name).toBe("test-ntp");
    });
  });

  describe("getFromSource", () => {
    test("throws for unknown source name", async () => {
      const ts = new TimeSynthesis({ sources: ["nist"] });
      await expect(ts.getFromSource("unknown")).rejects.toThrow("Source unknown not found");
    });
  });

  describe("Constructor source selection", () => {
    test("cloudflare source is configured", () => {
      const ts = new TimeSynthesis({ sources: ["cloudflare"] });
      expect(ts["sources"].length).toBe(1);
      expect(ts["sources"][0].name).toBe("cloudflare");
    });

    test("default sources are nist, kriss, google, cloudflare", () => {
      const ts = new TimeSynthesis();
      expect(ts["sources"].length).toBe(4);
    });

    test("unknown source name is silently skipped", () => {
      const ts = new TimeSynthesis({ sources: ["unknown_source"] });
      expect(ts["sources"].length).toBe(0);
    });
  });

  describe("verifyProofOfTime edge cases", () => {
    let ts: TimeSynthesis;

    beforeEach(() => {
      ts = new TimeSynthesis({ sources: ["nist"] });
    });

    test("rejects PoT with empty sourceReadings", () => {
      const pot: ProofOfTime = {
        timestamp: BigInt(Date.now()) * 1_000_000n,
        uncertainty: 5,
        sources: 0,
        stratum: 2,
        confidence: 0,
        sourceReadings: [],
        nonce: "abc123",
        expiresAt: BigInt(Date.now()) + 60_000n,
      };
      expect(ts.verifyProofOfTime(pot)).toBe(false);
    });

    test("rejects PoT with confidence <= 0", () => {
      const pot: ProofOfTime = {
        timestamp: BigInt(Date.now()) * 1_000_000n,
        uncertainty: 5,
        sources: 1,
        stratum: 2,
        confidence: 0,
        sourceReadings: [{ source: "nist", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 }],
        nonce: "abc456",
        expiresAt: BigInt(Date.now()) + 60_000n,
      };
      expect(ts.verifyProofOfTime(pot)).toBe(false);
    });

    test("rejects expired PoT", () => {
      const pot: ProofOfTime = {
        timestamp: BigInt(Date.now()) * 1_000_000n,
        uncertainty: 5,
        sources: 1,
        stratum: 2,
        confidence: 1,
        sourceReadings: [{ source: "nist", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 }],
        nonce: "expired-nonce",
        expiresAt: BigInt(Date.now()) - 1000n, // Already expired
      };
      expect(ts.verifyProofOfTime(pot)).toBe(false);
    });

    test("rejects duplicate nonce (replay)", () => {
      const now = BigInt(Date.now());
      const ts2 = BigInt(Date.now()) * 1_000_000n;
      const pot: ProofOfTime = {
        timestamp: ts2,
        uncertainty: 5,
        sources: 1,
        stratum: 2,
        confidence: 1,
        sourceReadings: [{ source: "nist", timestamp: ts2, uncertainty: 5 }],
        nonce: "replay-nonce",
        expiresAt: now + 60_000n,
      };
      // First call succeeds
      expect(ts.verifyProofOfTime(pot)).toBe(true);
      // Second call with same nonce rejects
      expect(ts.verifyProofOfTime(pot)).toBe(false);
    });

    test("rejects PoT with source reading outside tolerance", () => {
      const baseTs = BigInt(Date.now()) * 1_000_000n;
      const pot: ProofOfTime = {
        timestamp: baseTs,
        uncertainty: 5,
        sources: 1,
        stratum: 2,
        confidence: 1,
        sourceReadings: [{
          source: "nist",
          timestamp: baseTs + 100_000_000n, // 100ms off, tolerance for stratum 2 is 25ms
          uncertainty: 5
        }],
        nonce: "out-of-tolerance-nonce",
        expiresAt: BigInt(Date.now()) + 60_000n,
      };
      expect(ts.verifyProofOfTime(pot)).toBe(false);
    });

    test("stratum-based tolerance: stratum 1 = 10ms", () => {
      const baseTs = BigInt(Date.now()) * 1_000_000n;
      const pot: ProofOfTime = {
        timestamp: baseTs,
        uncertainty: 5,
        sources: 1,
        stratum: 1,
        confidence: 1,
        sourceReadings: [{
          source: "nist",
          timestamp: baseTs + 5_000_000n, // 5ms off, within 10ms tolerance for stratum 1
          uncertainty: 5,
          stratum: 1
        }],
        nonce: "stratum1-ok",
        expiresAt: BigInt(Date.now()) + 60_000n,
      };
      expect(ts.verifyProofOfTime(pot)).toBe(true);
    });

    test("stratum-based tolerance: stratum 3+ = 50ms", () => {
      const baseTs = BigInt(Date.now()) * 1_000_000n;
      const pot: ProofOfTime = {
        timestamp: baseTs,
        uncertainty: 5,
        sources: 1,
        stratum: 3,
        confidence: 1,
        sourceReadings: [{
          source: "nist",
          timestamp: baseTs + 40_000_000n, // 40ms off, within 50ms tolerance for stratum 3
          uncertainty: 5,
          stratum: 3
        }],
        nonce: "stratum3-ok",
        expiresAt: BigInt(Date.now()) + 60_000n,
      };
      expect(ts.verifyProofOfTime(pot)).toBe(true);
    });
  });

  describe("Serialization roundtrips", () => {
    test("serializeToJSON / deserializeFromJSON", () => {
      const pot: ProofOfTime = {
        timestamp: 1234567890_000_000_000n,
        uncertainty: 5.5,
        sources: 2,
        stratum: 2,
        confidence: 0.8,
        sourceReadings: [
          { source: "nist", timestamp: 1234567890_000_000_000n, uncertainty: 3 },
          { source: "google", timestamp: 1234567891_000_000_000n, uncertainty: 4 },
        ],
        nonce: "test-nonce-json",
        expiresAt: 9999999999999n,
      };
      const json = TimeSynthesis.serializeToJSON(pot);
      const restored = TimeSynthesis.deserializeFromJSON(json);
      expect(restored.timestamp).toBe(pot.timestamp);
      expect(restored.expiresAt).toBe(pot.expiresAt);
      expect(restored.nonce).toBe(pot.nonce);
      expect(restored.sourceReadings.length).toBe(2);
      expect(restored.sourceReadings[0].timestamp).toBe(pot.sourceReadings[0].timestamp);
    });

    test("serializeToBinary / deserializeFromBinary", () => {
      const pot: ProofOfTime = {
        timestamp: 1234567890_000_000_000n,
        uncertainty: 5.5,
        sources: 2,
        stratum: 2,
        confidence: 0.8,
        sourceReadings: [
          { source: "nist", timestamp: 1234567890_000_000_000n, uncertainty: 3 },
          { source: "google", timestamp: 1234567891_000_000_000n, uncertainty: 4 },
        ],
        nonce: "test-nonce-bin",
        expiresAt: 9999999999999n,
      };
      const buf = TimeSynthesis.serializeToBinary(pot);
      expect(buf).toBeInstanceOf(Buffer);
      const restored = TimeSynthesis.deserializeFromBinary(buf);
      expect(restored.timestamp).toBe(pot.timestamp);
      expect(restored.nonce).toBe(pot.nonce);
      expect(restored.expiresAt).toBe(pot.expiresAt);
      expect(restored.sourceReadings.length).toBe(2);
      expect(restored.sources).toBe(2);
    });
  });

  describe("getOnChainHash", () => {
    test("returns a bytes32 hex string", () => {
      const pot: ProofOfTime = {
        timestamp: 1234567890_000_000_000n,
        uncertainty: 5,
        sources: 2,
        stratum: 2,
        confidence: 0.8,
        sourceReadings: [],
        nonce: "hash-test",
        expiresAt: 9999999999999n,
      };
      const hash = TimeSynthesis.getOnChainHash(pot);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("generateProofOfTime edge cases", () => {
    test("throws when all sources fail", async () => {
      const ts = new TimeSynthesis({ sources: ["nist", "google"] });
      ts["sources"][0].getTime = jest.fn().mockRejectedValue(new Error("fail"));
      ts["sources"][1].getTime = jest.fn().mockRejectedValue(new Error("fail"));
      await expect(ts.generateProofOfTime()).rejects.toThrow("Cannot generate PoT");
    });

    test("handles single source PoT", async () => {
      const ts = new TimeSynthesis({ sources: ["nist", "google"] });
      const reading: TimeReading = { timestamp: 5000n, uncertainty: 2, stratum: 2, source: "nist" };
      ts["sources"][0].getTime = jest.fn().mockResolvedValue(reading);
      ts["sources"][1].getTime = jest.fn().mockRejectedValue(new Error("fail"));
      const pot = await ts.generateProofOfTime();
      expect(pot.timestamp).toBe(5000n);
      expect(pot.sources).toBe(1);
    });

    test("handles two-source PoT (average)", async () => {
      const ts = new TimeSynthesis({ sources: ["nist", "google"] });
      ts["sources"][0].getTime = jest.fn().mockResolvedValue(
        { timestamp: 1000n, uncertainty: 4, stratum: 2, source: "nist" }
      );
      ts["sources"][1].getTime = jest.fn().mockResolvedValue(
        { timestamp: 2000n, uncertainty: 6, stratum: 1, source: "google" }
      );
      const pot = await ts.generateProofOfTime();
      expect(pot.timestamp).toBe(1500n); // average
      expect(pot.sources).toBe(2);
      expect(pot.stratum).toBe(1); // min
    });
  });
});

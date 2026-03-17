/**
 * @helm-protocol/x402-pot — unit tests
 * All network calls are mocked; no real HTTP requests made.
 */

import { X402PotFacilitator, X402PotPayment } from "../src/index";
import { HttpOnlyClient } from "openttt";

// ---------------------------------------------------------------------------
// Mock openttt HttpOnlyClient
// ---------------------------------------------------------------------------

const MOCK_TIMESTAMP = 1_710_000_000_000_000_000n; // nanoseconds
const MOCK_EXPIRES_AT = BigInt(Date.now() + 60_000);  // 60s from now in ms
const MOCK_NONCE = "aabbccddeeff00112233445566778899";
const MOCK_HMAC = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const mockGeneratePoT = jest.fn().mockResolvedValue({
  timestamp:      MOCK_TIMESTAMP,
  expiresAt:      MOCK_EXPIRES_AT,
  hmac:           MOCK_HMAC,
  nonce:          MOCK_NONCE,
  confidence:     0.75,
  sources:        3,
  stratum:        2,
  sourceReadings: [
    { source: "nist",       timestamp: MOCK_TIMESTAMP, uncertainty: 500, stratum: 2 },
    { source: "google",     timestamp: MOCK_TIMESTAMP, uncertainty: 500, stratum: 2 },
    { source: "cloudflare", timestamp: MOCK_TIMESTAMP, uncertainty: 500, stratum: 2 },
  ],
});

const mockVerifyPoT = jest.fn().mockReturnValue({ valid: true });

jest.mock("openttt", () => {
  return {
    HttpOnlyClient: jest.fn().mockImplementation(() => ({
      generatePoT: mockGeneratePoT,
      verifyPoT:   mockVerifyPoT,
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PAYMENT = {
  scheme:             "exact",
  network:            "base",
  maxAmountRequired:  "1000000",
  resource:           "https://api.example.com/data",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("X402PotFacilitator", () => {
  let facilitator: X402PotFacilitator;

  beforeEach(() => {
    jest.clearAllMocks();
    facilitator = new X402PotFacilitator();
  });

  // --- createPaymentWithPoT ---

  describe("createPaymentWithPoT", () => {
    it("returns base payment fields unchanged", async () => {
      const result = await facilitator.createPaymentWithPoT(BASE_PAYMENT);
      expect(result.scheme).toBe("exact");
      expect(result.network).toBe("base");
      expect(result.maxAmountRequired).toBe("1000000");
      expect(result.resource).toBe("https://api.example.com/data");
    });

    it("attaches extra.pot with correct fields", async () => {
      const result = await facilitator.createPaymentWithPoT(BASE_PAYMENT);
      const pot = result.extra.pot;

      expect(pot.timestamp).toBe(MOCK_TIMESTAMP.toString());
      expect(pot.expiresAt).toBe(MOCK_EXPIRES_AT.toString());
      expect(pot.hmac).toBe(MOCK_HMAC);
      expect(pot.nonce).toBe(MOCK_NONCE);
      expect(pot.confidence).toBe(0.75);
      expect(pot.sources).toBe(3);
      expect(pot.sourceNames).toEqual(["nist", "google", "cloudflare"]);
    });

    it("serialises bigint timestamp and expiresAt as strings", async () => {
      const result = await facilitator.createPaymentWithPoT(BASE_PAYMENT);
      expect(typeof result.extra.pot.timestamp).toBe("string");
      expect(typeof result.extra.pot.expiresAt).toBe("string");
    });

    it("calls generatePoT exactly once", async () => {
      await facilitator.createPaymentWithPoT(BASE_PAYMENT);
      expect(mockGeneratePoT).toHaveBeenCalledTimes(1);
    });
  });

  // --- verifyPaymentPoT ---

  describe("verifyPaymentPoT", () => {
    let payment: X402PotPayment;

    beforeEach(async () => {
      payment = await facilitator.createPaymentWithPoT(BASE_PAYMENT);
    });

    it("returns valid: true for a well-formed payment", async () => {
      const result = await facilitator.verifyPaymentPoT(payment);
      expect(result.valid).toBe(true);
    });

    it("calls verifyPoT with reconstructed HttpPoT shape", async () => {
      await facilitator.verifyPaymentPoT(payment);
      expect(mockVerifyPoT).toHaveBeenCalledTimes(1);
      const arg = mockVerifyPoT.mock.calls[0][0];
      expect(arg.timestamp).toBe(MOCK_TIMESTAMP);
      expect(arg.nonce).toBe(MOCK_NONCE);
      expect(arg.hmac).toBe(MOCK_HMAC);
    });

    it("returns valid: false when extra.pot is missing", async () => {
      const broken = { ...BASE_PAYMENT, extra: {} } as unknown as X402PotPayment;
      const result = await facilitator.verifyPaymentPoT(broken);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/No PoT found/);
    });

    it("returns valid: false when timestamp is not a valid bigint string", async () => {
      const broken: X402PotPayment = {
        ...payment,
        extra: {
          pot: { ...payment.extra.pot, timestamp: "not-a-number" },
        },
      };
      const result = await facilitator.verifyPaymentPoT(broken);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Invalid bigint/);
    });

    it("returns valid: false when verifyPoT returns invalid", async () => {
      mockVerifyPoT.mockReturnValueOnce({ valid: false, reason: "PoT expired" });
      const result = await facilitator.verifyPaymentPoT(payment);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("PoT expired");
    });
  });

  // --- constructor options passthrough ---

  describe("constructor", () => {
    it("passes options to HttpOnlyClient", () => {
      new X402PotFacilitator({ expirySeconds: 120, timeoutMs: 5000 });
      expect(HttpOnlyClient).toHaveBeenCalledWith({ expirySeconds: 120, timeoutMs: 5000 });
    });

    it("works with no options (defaults)", () => {
      expect(() => new X402PotFacilitator()).not.toThrow();
      expect(HttpOnlyClient).toHaveBeenCalledWith({});
    });
  });
});

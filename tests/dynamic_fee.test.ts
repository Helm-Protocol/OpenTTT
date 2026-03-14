import { DynamicFeeEngine, TIER_USD_MICRO, FEE_TIERS } from "../src/dynamic_fee";

describe("DynamicFeeEngine", () => {
  let engine: DynamicFeeEngine;

  beforeEach(() => {
    engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n, // $0.01
    });
  });

  it("should reject fallbackPriceUsd <= 0", () => {
    expect(() => new DynamicFeeEngine({ cacheDurationMs: 5000, fallbackPriceUsd: 0n }))
      .toThrow("fallbackPriceUsd must be > 0");
    expect(() => new DynamicFeeEngine({ cacheDurationMs: 5000, fallbackPriceUsd: -1n }))
      .toThrow("fallbackPriceUsd must be > 0");
  });

  it("should calculate mint fee for all tiers", async () => {
    for (const tier of Object.keys(TIER_USD_MICRO)) {
      const fee = await engine.calculateMintFee(tier);
      expect(fee.tttAmount).toBeGreaterThan(0n);
      expect(fee.protocolFeeUsd).toBeGreaterThanOrEqual(0n);
      expect(fee.tier).toBe(tier);
    }
  });

  it("should calculate burn fee for all tiers", async () => {
    for (const tier of Object.keys(TIER_USD_MICRO)) {
      const fee = await engine.calculateBurnFee(tier);
      expect(fee.tttAmount).toBeGreaterThan(0n);
      expect(fee.feeRateBurn).toBeGreaterThan(0n);
    }
  });

  it("should reject invalid tier", async () => {
    await expect(engine.calculateMintFee("INVALID_TIER")).rejects.toThrow("Invalid tier");
  });

  it("should reject tickCount <= 0", async () => {
    await expect(engine.calculateMintFee("T1_block", 0)).rejects.toThrow("tickCount must be positive");
    await expect(engine.calculateMintFee("T1_block", -1)).rejects.toThrow("tickCount must be positive");
  });

  it("should scale fees with tickCount", async () => {
    const fee1 = await engine.calculateMintFee("T1_block", 1);
    const fee5 = await engine.calculateMintFee("T1_block", 5);
    expect(fee5.tttAmount).toBe(fee1.tttAmount * 5n);
  });

  it("should return correct fee phases", () => {
    expect(engine.getFeeRate(1000n).phase).toBe("BOOTSTRAP");
    expect(engine.getFeeRate(10000n).phase).toBe("GROWTH");
    expect(engine.getFeeRate(100000n).phase).toBe("MATURE");
    expect(engine.getFeeRate(1000000n).phase).toBe("PREMIUM");
  });

  it("should invalidate cache", async () => {
    const price1 = await engine.getTTTPriceUsd();
    engine.invalidateCache();
    const price2 = await engine.getTTTPriceUsd();
    // Both should be fallback since no provider
    expect(price1).toBe(price2);
  });

  it("should calculate emergency mint fee at 150%", async () => {
    const base = await engine.calculateMintFee("T1_block");
    const emergency = await engine.calculateEmergencyMintFee("T1_block");
    expect(emergency.protocolFeeUsd).toBe((base.protocolFeeUsd * 150n) / 100n);
  });
});

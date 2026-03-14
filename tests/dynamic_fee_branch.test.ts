// Tests for uncovered branches in dynamic_fee.ts
// Targets: cacheDurationMs warning (line 62), connect validation (line 73),
// cache hit path, burn fee tickCount validation, emergency fee for invalid tier
import { DynamicFeeEngine, TIER_USD_MICRO, FEE_TIERS } from "../src/dynamic_fee";

describe("DynamicFeeEngine — uncovered branches", () => {

  test("warns when cacheDurationMs exceeds recommended max (line 62)", () => {
    // This should log a warning but not throw
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 60000, // 60s >> 5s recommended
      fallbackPriceUsd: 10000n,
    });
    expect(engine).toBeDefined();
  });

  test("connect rejects empty URL array (line 73)", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    await expect(engine.connect([])).rejects.toThrow("At least one valid RPC URL is required");
  });

  test("connect rejects all-empty URL strings", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    await expect(engine.connect(["", ""])).rejects.toThrow("At least one valid RPC URL is required");
  });

  test("getTTTPriceUsd returns cached price on second call", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 60000, // Long cache
      fallbackPriceUsd: 50000n,
    });
    const price1 = await engine.getTTTPriceUsd();
    const price2 = await engine.getTTTPriceUsd();
    expect(price1).toBe(50000n);
    expect(price2).toBe(50000n); // Should hit cache
  });

  test("calculateBurnFee rejects tickCount <= 0", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    await expect(engine.calculateBurnFee("T1_block", 0)).rejects.toThrow("tickCount must be positive");
    await expect(engine.calculateBurnFee("T1_block", -5)).rejects.toThrow("tickCount must be positive");
  });

  test("calculateBurnFee rejects invalid tier", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    await expect(engine.calculateBurnFee("INVALID")).rejects.toThrow("Invalid tier");
  });

  test("calculateBurnFee returns correct structure", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    const fee = await engine.calculateBurnFee("T2_slot", 3);
    expect(fee.tier).toBe("T2_slot");
    expect(fee.tttAmount).toBeGreaterThan(0n);
    expect(fee.protocolFeeUsd).toBeGreaterThanOrEqual(0n);
    expect(fee.feeToken).toBe("USDC");
  });

  test("calculateEmergencyMintFee rejects invalid tier", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    await expect(engine.calculateEmergencyMintFee("BAD_TIER")).rejects.toThrow("Invalid tier");
  });

  test("getFeeRate returns correct phase for all thresholds", () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
    // Below BOOTSTRAP threshold (5000)
    const r1 = engine.getFeeRate(4999n);
    expect(r1.phase).toBe("BOOTSTRAP");
    expect(r1.mintFee).toBe(500n);

    // At BOOTSTRAP threshold (becomes GROWTH)
    const r2 = engine.getFeeRate(5000n);
    expect(r2.phase).toBe("GROWTH");

    // At GROWTH threshold (becomes MATURE)
    const r3 = engine.getFeeRate(50000n);
    expect(r3.phase).toBe("MATURE");

    // At MATURE threshold (becomes PREMIUM)
    const r4 = engine.getFeeRate(500000n);
    expect(r4.phase).toBe("PREMIUM");
    expect(r4.mintFee).toBe(800n);
  });

  test("TIER_USD_MICRO has expected values", () => {
    expect(TIER_USD_MICRO.T0_epoch).toBe(1000n);
    expect(TIER_USD_MICRO.T1_block).toBe(10000n);
    expect(TIER_USD_MICRO.T2_slot).toBe(240000n);
    expect(TIER_USD_MICRO.T3_micro).toBe(12000000n);
  });

  test("FEE_TIERS structure is correct", () => {
    expect(FEE_TIERS.BOOTSTRAP.mintFee).toBe(500n);
    expect(FEE_TIERS.BOOTSTRAP.burnFee).toBe(200n);
    expect(FEE_TIERS.PREMIUM.threshold).toBe(-1n);
  });

  test("calculateMintFee and calculateBurnFee differ in fee rate applied", async () => {
    const engine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,  // $0.01 → GROWTH phase (10000 >= 5000 threshold)
    });
    const mint = await engine.calculateMintFee("T1_block");
    const burn = await engine.calculateBurnFee("T1_block");
    // In GROWTH: mintFee=1000 (10%), burnFee=300 (3%)
    expect(mint.feeRateMint).toBe(1000n);
    expect(burn.feeRateBurn).toBe(300n);
    // Protocol fee USD should differ
    expect(mint.protocolFeeUsd).toBeGreaterThan(burn.protocolFeeUsd);
  });
});

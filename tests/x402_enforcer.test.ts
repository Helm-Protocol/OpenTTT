import { X402Enforcer } from "../src/x402_enforcer";
import { DynamicFeeEngine } from "../src/dynamic_fee";
import { AdaptiveMode } from "../src/adaptive_switch";

describe("X402Enforcer", () => {
  let feeEngine: DynamicFeeEngine;

  beforeEach(() => {
    feeEngine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: 10000n,
    });
  });

  const swap = {
    user: "0x1234567890123456789012345678901234567890",
    tokenIn: "0xAAAA",
    tokenOut: "0xBBBB",
    amount: 1000n,
  };

  it("should deduct tick from sufficient balance", async () => {
    const balance = 10n ** 18n; // 1 ETH worth
    const result = await X402Enforcer.deductTick(feeEngine, swap, balance, 1, AdaptiveMode.FULL);
    expect(result.success).toBe(true);
    expect(result.remaining).toBeLessThan(balance);
    expect(result.remaining).toBeGreaterThanOrEqual(0n);
  });

  it("should throw on insufficient balance", async () => {
    const balance = 0n;
    await expect(
      X402Enforcer.deductTick(feeEngine, swap, balance, 1, AdaptiveMode.FULL)
    ).rejects.toThrow("Insufficient TTT ticks");
  });

  it("should enforce pool with sufficient balance", async () => {
    const balance = 10n ** 18n;
    const result = await X402Enforcer.enforcePool(feeEngine, swap, balance, 1);
    expect(result).toBe(true);
  });

  it("should reject pool enforcement with zero balance", async () => {
    const result = await X402Enforcer.enforcePool(feeEngine, swap, 0n, 1);
    expect(result).toBe(false);
  });

  it("should preserve mode through deduction", async () => {
    const balance = 10n ** 18n;
    const result = await X402Enforcer.deductTick(feeEngine, swap, balance, 1, AdaptiveMode.TURBO);
    expect(result.mode).toBe(AdaptiveMode.TURBO);
  });
});

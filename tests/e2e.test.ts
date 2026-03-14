// sdk/tests/e2e.test.ts — TTT Full Pipeline E2E Test
import { GrgForward } from "../src/grg_forward";
import { GrgInverse } from "../src/grg_inverse";
import { AdaptiveSwitch, AdaptiveMode, TTTRecord, Block } from "../src/adaptive_switch";
import { X402Enforcer, SwapDetails } from "../src/x402_enforcer";
import { DynamicFeeEngine } from "../src/dynamic_fee";

describe("TTT E2E Pipeline Tests", () => {
  const data = new TextEncoder().encode("TLS Time Protocol v0.1");
  const txOrder = ["tx_alpha", "tx_beta", "tx_gamma"];
  const timestamp = Date.now();
  const testChainId = 1;
  const testPoolAddress = "0x1234567890123456789012345678901234567890";
  let adaptiveSwitch: AdaptiveSwitch;
  let mockFeeEngine: any;

  const swap: SwapDetails = {
    user: "0xBuilder001",
    tokenIn: "USDC",
    tokenOut: "ETH",
    amount: 1000n,
  };

  // GRG forward encode (issuer side)
  const grgPayload = GrgForward.encode(data, testChainId, testPoolAddress);

  const validRecord: TTTRecord = {
    time: timestamp,
    txOrder,
    grgPayload,
  };

  const validBlock: Block = {
    timestamp,
    txs: txOrder,
    data,
  };

  beforeEach(() => {
    adaptiveSwitch = new AdaptiveSwitch();
    
    // Mock DynamicFeeEngine
    mockFeeEngine = {
      calculateMintFee: jest.fn().mockImplementation(async (tier: string) => {
        let tttAmount = 10000n * (10n ** 12n); // Default T1
        if (tier === "T0_epoch") tttAmount = 1000n * (10n ** 12n);
        if (tier === "T2_slot") tttAmount = 240000n * (10n ** 12n);
        return { tttAmount };
      })
    };
  });

  test("E2E 1: Honest Builder → TURBO + Tick Deducted", async () => {
    // Step 1: GRG inverse verify (builder receives and verifies)
    const integrityOk = GrgInverse.verify(data, grgPayload, testChainId, testPoolAddress);
    expect(integrityOk).toBe(true);

    // Step 2: Adaptive switch judges (transition to TURBO after 20 blocks)
    for (let i = 0; i < 19; i++) {
      adaptiveSwitch.verifyBlock(validBlock, validRecord, testChainId, testPoolAddress);
    }
    const mode = adaptiveSwitch.verifyBlock(validBlock, validRecord, testChainId, testPoolAddress);
    expect(mode).toBe(AdaptiveMode.TURBO);

    // Step 3: x402 tick deduction
    const initialBalance = 10n ** 18n;
    const costT1 = 10000n * (10n ** 12n); // T1_block: $0.01
    const result = await X402Enforcer.deductTick(mockFeeEngine, swap, initialBalance, 1, mode);
    expect(result.success).toBe(true);
    expect(result.mode).toBe(AdaptiveMode.TURBO);
    expect(result.remaining).toBe(initialBalance - costT1);
  });

  test("E2E 2: Tampered Builder → FULL (order changed)", async () => {
    const tamperedBlock: Block = {
      timestamp,
      txs: ["tx_gamma", "tx_beta", "tx_alpha"], // reversed
      data,
    };

    // Adaptive switch detects tamper
    const mode = adaptiveSwitch.verifyBlock(tamperedBlock, validRecord, testChainId, testPoolAddress);
    expect(mode).toBe(AdaptiveMode.FULL);

    // Tick still deducted (swap happened, just slow)
    const initialBalance = 10n ** 18n;
    const costT1 = 10000n * (10n ** 12n);
    const result = await X402Enforcer.deductTick(mockFeeEngine, swap, initialBalance, 1, mode);
    expect(result.success).toBe(true);
    expect(result.mode).toBe(AdaptiveMode.FULL); 
    expect(result.remaining).toBe(initialBalance - costT1);
  });

  test("E2E 3: Insufficient Balance → FULL Forced", async () => {
    await expect(X402Enforcer.deductTick(mockFeeEngine, swap, 0n, 1, AdaptiveMode.FULL))
      .rejects.toThrow("[x402] Insufficient TTT ticks");
  });

  test("E2E 4: Data Tamper → GRG Catches It", () => {
    const tamperedData = new TextEncoder().encode("TLS Time Protocol v0.2");
    const tamperedBlock: Block = {
      timestamp,
      txs: txOrder,
      data: tamperedData,
    };

    const mode = adaptiveSwitch.verifyBlock(tamperedBlock, validRecord, testChainId, testPoolAddress);
    expect(mode).toBe(AdaptiveMode.FULL);
  });

  test("E2E 5: GRG Forward→Inverse Roundtrip Integrity (RS Recovery)", () => {
    // Full pipeline: encode → decode → verify original
    const ok = GrgInverse.verify(data, grgPayload, testChainId, testPoolAddress);
    expect(ok).toBe(true);

    // Tamper 1 shard → verify succeeds (RS recovers ANY 4-of-6)
    const tampered1Shard = grgPayload.map((s, i) => {
      if (i === 0) {
        const copy = new Uint8Array(s);
        copy[0] ^= 0xFF;
        return copy;
      }
      return s;
    });
    const tamper1Ok = GrgInverse.verify(data, tampered1Shard, testChainId, testPoolAddress);
    expect(tamper1Ok).toBe(true);

    // Tamper 3 shards → verify fails (cannot recover with < 4 shards)
    const tampered3Shards = grgPayload.map((s, i) => {
      if (i < 3) {
        const copy = new Uint8Array(s);
        copy[0] ^= 0xFF;
        return copy;
      }
      return s;
    });
    const tamper3Ok = GrgInverse.verify(data, tampered3Shards, testChainId, testPoolAddress);
    expect(tamper3Ok).toBe(false);
  });

  test("E2E 6: Tier Pricing Correctness", async () => {
    const initialBalance = 10n ** 18n;
    const costT0 = 1000n * (10n ** 12n);
    const costT1 = 10000n * (10n ** 12n);
    const costT2 = 240000n * (10n ** 12n);

    // T0
    const r0 = await X402Enforcer.deductTick(mockFeeEngine, swap, initialBalance, 0, AdaptiveMode.FULL);
    expect(r0.remaining).toBe(initialBalance - costT0);

    // T1
    const r1 = await X402Enforcer.deductTick(mockFeeEngine, swap, initialBalance, 1, AdaptiveMode.FULL);
    expect(r1.remaining).toBe(initialBalance - costT1);

    // T2
    const smallBalance = 10n ** 16n; // 0.01 TTT
    await expect(X402Enforcer.deductTick(mockFeeEngine, swap, smallBalance, 2, AdaptiveMode.FULL))
      .rejects.toThrow("[x402] Insufficient TTT ticks");
  });
});

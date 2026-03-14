// sdk/tests/turbo_full.test.ts — Turbo/Full Adaptive Switch Tests

import { AdaptiveSwitch, AdaptiveMode, Block, TTTRecord } from "../src/adaptive_switch";
import { GrgForward } from "../src/grg_forward";

describe("AdaptiveSwitch: Turbo/Full Mechanism", () => {
  const mockData = new Uint8Array(12).fill(1);
  const mockGrgPayload = GrgForward.encode(mockData);
  const txs = ["tx1", "tx2", "tx3"];
  const timestamp = Date.now();
  let adaptiveSwitch: AdaptiveSwitch;

  beforeEach(() => {
    adaptiveSwitch = new AdaptiveSwitch();
  });

  test("Initially starts in FULL mode", () => {
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.FULL);
    expect(adaptiveSwitch.getFeeDiscount()).toBe(0.0);
  });

  test("Honest Builder Scenario: Transitions to TURBO after 20 successful blocks", () => {
    const block: Block = { timestamp, txs, data: mockData };
    const tttRecord: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };

    // 1-19 blocks: Still FULL (need minimum 20 for history)
    for (let i = 0; i < 19; i++) {
      const mode = adaptiveSwitch.verifyBlock(block, tttRecord);
      expect(mode).toBe(AdaptiveMode.FULL);
    }

    // 20th block: Threshold 100% (>= 90%) -> Transition to TURBO
    const mode = adaptiveSwitch.verifyBlock(block, tttRecord);
    expect(mode).toBe(AdaptiveMode.TURBO);
    expect(adaptiveSwitch.getFeeDiscount()).toBe(0.2);
  });

  test("Malicious Builder Scenario: Stays in FULL mode if order is mismatched", () => {
    const block: Block = { timestamp, txs, data: mockData };
    const tamperedRecord: TTTRecord = { time: timestamp, txOrder: ["tx3", "tx2", "tx1"], grgPayload: mockGrgPayload };

    for (let i = 0; i < 30; i++) {
      const mode = adaptiveSwitch.verifyBlock(block, tamperedRecord);
      expect(mode).toBe(AdaptiveMode.FULL);
    }
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.FULL);
  });

  test("Tampered Builder Scenario: Stays in FULL mode if timestamp is out of tolerance", () => {
    const block: Block = { timestamp, txs, data: mockData };
    const tamperedRecord: TTTRecord = { time: timestamp + 200, txOrder: txs, grgPayload: mockGrgPayload };

    for (let i = 0; i < 30; i++) {
      const mode = adaptiveSwitch.verifyBlock(block, tamperedRecord);
      expect(mode).toBe(AdaptiveMode.FULL);
    }
  });

  test("Dynamic Transition: TURBO -> FULL -> TURBO", () => {
    const honestBlock: Block = { timestamp, txs, data: mockData };
    const honestRecord: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };
    
    const maliciousRecord: TTTRecord = { time: timestamp, txOrder: ["tx-bad"], grgPayload: mockGrgPayload };

    // 1. Become Honest -> TURBO (after 20 blocks)
    for (let i = 0; i < 20; i++) {
      adaptiveSwitch.verifyBlock(honestBlock, honestRecord);
    }
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    // 2. Start Tampering -> FULL
    // P2-2: Hysteresis — maintain threshold is 85%, so need matchRate < 85%
    // History (20): [T x 20] -> 100%
    // Add 1 F: [T x 19, F] -> 19/20 = 95% (Still TURBO, >= 85%)
    // Add 2 F: [T x 18, F, F] -> 18/20 = 90% (Still TURBO, >= 85%)
    // Add 3 F: [T x 17, F, F, F] -> 17/20 = 85% (Still TURBO, >= 85%)
    // Add 4 F: [T x 16, F, F, F, F] -> 16/20 = 80% (Switch to FULL, < 85%)

    adaptiveSwitch.verifyBlock(honestBlock, maliciousRecord); // 21st
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    adaptiveSwitch.verifyBlock(honestBlock, maliciousRecord); // 22nd
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    adaptiveSwitch.verifyBlock(honestBlock, maliciousRecord); // 23rd
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.TURBO); // 85% = maintain threshold

    adaptiveSwitch.verifyBlock(honestBlock, maliciousRecord); // 24th — drops below 85%
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.FULL);
    expect(adaptiveSwitch.getFeeDiscount()).toBe(0.0);

    // 3. Become Honest again -> Recovery to TURBO
    // P2-2: Re-entry requires 95% (entry threshold)
    // Current history: [T x 16, F, F, F, F]
    // Need to push out all 4 F's and reach 95%: 19/20 = 95%
    // After 20 honest blocks, cooldown also needs to expire
    // P2-1: penaltyCooldown = 20 (exponential backoff base)
    for (let i = 0; i < 40; i++) { // enough to clear cooldown + fill window
      adaptiveSwitch.verifyBlock(honestBlock, honestRecord);
    }
    expect(adaptiveSwitch.getCurrentMode()).toBe(AdaptiveMode.TURBO);
    expect(adaptiveSwitch.getFeeDiscount()).toBe(0.2);
  });
});

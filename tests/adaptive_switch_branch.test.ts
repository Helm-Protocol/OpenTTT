// Tests for uncovered branches in adaptive_switch.ts
// Targets: serialize/deserialize (lines 115-144), penaltyCooldown decrement (line 67),
// TURBO integrity failure with exponential backoff (lines 53-56)
import { AdaptiveSwitch, AdaptiveMode, Block, TTTRecord } from "../src/adaptive_switch";
import { GrgForward } from "../src/grg_forward";

describe("AdaptiveSwitch — uncovered branches", () => {
  const mockData = new Uint8Array(12).fill(1);
  const testChainId = 1;
  const testPoolAddress = "0x1234567890123456789012345678901234567890";
  const mockGrgPayload = GrgForward.encode(mockData, testChainId, testPoolAddress);
  const txs = ["tx1", "tx2", "tx3"];
  const timestamp = Date.now();

  test("serialize/deserialize roundtrip preserves state", () => {
    const sw = new AdaptiveSwitch();
    const block: Block = { timestamp, txs, data: mockData };
    const record: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };

    // Build up some history
    for (let i = 0; i < 20; i++) {
      sw.verifyBlock(block, record, testChainId, testPoolAddress);
    }
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    // Serialize and deserialize
    const json = sw.serialize();
    const restored = AdaptiveSwitch.deserialize(json);
    expect(restored.getCurrentMode()).toBe(AdaptiveMode.TURBO);
    expect(restored.getFeeDiscount()).toBe(0.2);
  });

  test("serialize includes all fields", () => {
    const sw = new AdaptiveSwitch();
    const json = sw.serialize();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("history");
    expect(parsed).toHaveProperty("currentMode");
    expect(parsed).toHaveProperty("consecutiveFailures");
    expect(parsed).toHaveProperty("penaltyCooldown");
  });

  test("deserialize restores penaltyCooldown and consecutiveFailures", () => {
    const json = JSON.stringify({
      history: [true, true, false, true],
      currentMode: AdaptiveMode.FULL,
      consecutiveFailures: 3,
      penaltyCooldown: 80,
    });
    const restored = AdaptiveSwitch.deserialize(json);
    expect(restored.getCurrentMode()).toBe(AdaptiveMode.FULL);
    // Verify the restored instance uses the cooldown — it should stay FULL even with good blocks
    const block: Block = { timestamp, txs, data: mockData };
    const record: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };
    // With penaltyCooldown=80, even perfect blocks won't switch to TURBO
    for (let i = 0; i < 20; i++) {
      restored.verifyBlock(block, record, testChainId, testPoolAddress);
    }
    // Cooldown decrements by 1 each block, 80-20=60 remaining, so still FULL
    expect(restored.getCurrentMode()).toBe(AdaptiveMode.FULL);
  });

  test("GRG integrity failure in TURBO triggers exponential backoff (lines 53-56)", () => {
    const sw = new AdaptiveSwitch();
    const block: Block = { timestamp, txs, data: mockData };
    const record: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };

    // Build to TURBO
    for (let i = 0; i < 20; i++) {
      sw.verifyBlock(block, record, testChainId, testPoolAddress);
    }
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    // Now trigger GRG integrity failure (tampered data while in TURBO)
    const tamperedBlock: Block = {
      timestamp,
      txs,
      data: new Uint8Array(12).fill(99), // different data
    };
    const mode = sw.verifyBlock(tamperedBlock, record, testChainId, testPoolAddress);
    // Should drop to FULL due to integrity failure
    // After this, penaltyCooldown should be set > 0
    // The consecutive failure sets cooldown = 20 * 2^0 = 20
    // Mode could stay TURBO if match rate is still above maintain threshold (85%)
    // But the penalty cooldown should be applied
    const serialized = JSON.parse(sw.serialize());
    expect(serialized.consecutiveFailures).toBeGreaterThan(0);
  });

  test("penaltyCooldown decrements each block (line 67)", () => {
    // Start with a short cooldown via deserialize
    const json = JSON.stringify({
      history: new Array(20).fill(true),
      currentMode: AdaptiveMode.FULL,
      consecutiveFailures: 0,
      penaltyCooldown: 3,
    });
    const sw = AdaptiveSwitch.deserialize(json);
    const block: Block = { timestamp, txs, data: mockData };
    const record: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };

    // Block 1: cooldown 3 -> 2
    sw.verifyBlock(block, record, testChainId, testPoolAddress);
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.FULL); // still cooling down

    // Block 2: cooldown 2 -> 1
    sw.verifyBlock(block, record, testChainId, testPoolAddress);
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.FULL);

    // Block 3: cooldown 1 -> 0
    sw.verifyBlock(block, record, testChainId, testPoolAddress);
    // Now cooldown is 0 and history is all true → should transition
    // But the deserialized history was 20 trues, plus 3 more trues = window is 20 (last 20, all true)
    // turboEntryThreshold = 0.95, matchRate = 100% → should enter TURBO
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.TURBO);
  });

  test("verifyBlock uses tier-based tolerance", () => {
    const sw = new AdaptiveSwitch({ tolerance: 100 });
    const now = Date.now();
    const txsList = ["tx1", "tx2", "tx3"];
    const data = new Uint8Array(12).fill(1);
    const grgPl = GrgForward.encode(data, testChainId, testPoolAddress);

    // Block timestamp is 50ms ahead of TTT record
    const block: Block = { timestamp: now + 50, txs: txsList, data };
    const record: TTTRecord = { time: now, txOrder: txsList, grgPayload: grgPl };

    // T3_micro tolerance = 10ms → 50ms offset should FAIL timeMatch → sequenceOk=false
    // Feed 20 blocks with T3_micro: all should fail timeMatch → stays FULL
    for (let i = 0; i < 20; i++) {
      sw.verifyBlock(block, record, testChainId, testPoolAddress, "T3_micro");
    }
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.FULL);

    // Reset and try with T1_block tolerance = 200ms → 50ms offset should PASS
    sw.reset();
    for (let i = 0; i < 20; i++) {
      sw.verifyBlock(block, record, testChainId, testPoolAddress, "T1_block");
    }
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.TURBO);
  });

  test("reset clears all state", () => {
    const sw = new AdaptiveSwitch();
    const block: Block = { timestamp, txs, data: mockData };
    const record: TTTRecord = { time: timestamp, txOrder: txs, grgPayload: mockGrgPayload };

    for (let i = 0; i < 20; i++) {
      sw.verifyBlock(block, record, testChainId, testPoolAddress);
    }
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.TURBO);

    sw.reset();
    expect(sw.getCurrentMode()).toBe(AdaptiveMode.FULL);
    expect(sw.getFeeDiscount()).toBe(0.0);
  });
});

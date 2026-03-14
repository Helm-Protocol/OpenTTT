// sdk/tests/grg_tamper.test.ts
import { GrgForward, GrgInverse, AdaptiveSwitch, AdaptiveMode, TTTRecord, Block } from "../src";

describe("TTT GRG Tamper Detection Tests", () => {
  const data = new TextEncoder().encode("TLS Time Protocol v0.1");
  const grgPayload = GrgForward.encode(data);
  const txOrder = ["tx1", "tx2", "tx3"];
  const timestamp = Date.now();
  let adaptiveSwitch: AdaptiveSwitch;

  beforeEach(() => {
    adaptiveSwitch = new AdaptiveSwitch();
  });

  const validRecord: TTTRecord = {
    time: timestamp,
    txOrder: txOrder,
    grgPayload: grgPayload
  };

  const validBlock: Block = {
    timestamp: timestamp,
    txs: txOrder,
    data: data
  };

  test("1. Order Tamper Detection", () => {
    const tamperedBlock: Block = {
      ...validBlock,
      txs: ["tx3", "tx2", "tx1"] // Reversed order
    };
    const mode = adaptiveSwitch.verifyBlock(tamperedBlock, validRecord);
    expect(mode).toBe(AdaptiveMode.FULL); // Should detect tamper and switch to FULL
  });

  test("2. Data Tamper Detection", () => {
    const tamperedBlock: Block = {
      ...validBlock,
      data: new TextEncoder().encode("TLS Time Protocol v0.2") // Changed content
    };
    const mode = adaptiveSwitch.verifyBlock(tamperedBlock, validRecord);
    expect(mode).toBe(AdaptiveMode.FULL);
  });

  test("3. Timestamp Tamper Detection", () => {
    const tamperedBlock: Block = {
      ...validBlock,
      timestamp: timestamp + 5000 // 5 seconds drift
    };
    const mode = adaptiveSwitch.verifyBlock(tamperedBlock, validRecord);
    expect(mode).toBe(AdaptiveMode.FULL);
  });

  test("4. Multi-bit Tamper Detection (Golay level)", () => {
    // Modify the encoded shards directly
    const tamperedShards = grgPayload.map(s => {
      const copy = new Uint8Array(s);
      copy[0] ^= 0xFF; // Flip all bits in first byte
      return copy;
    });
    
    const tamperedRecord: TTTRecord = {
      ...validRecord,
      grgPayload: tamperedShards
    };
    
    const mode = adaptiveSwitch.verifyBlock(validBlock, tamperedRecord);
    expect(mode).toBe(AdaptiveMode.FULL);
  });

  test("Valid Block Performance (TURBO)", () => {
    // Transition to TURBO (20 blocks)
    for (let i = 0; i < 19; i++) {
      adaptiveSwitch.verifyBlock(validBlock, validRecord);
    }
    const mode = adaptiveSwitch.verifyBlock(validBlock, validRecord);
    expect(mode).toBe(AdaptiveMode.TURBO);
  });
});

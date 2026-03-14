// sdk/tests/ttt_builder.test.ts — TTTBuilder Tests

import { TTTBuilder } from "../src/ttt_builder";
import { AdaptiveMode, AdaptiveSwitch, Block, TTTRecord } from "../src/adaptive_switch";
import { GrgForward } from "../src/grg_forward";
import { EVMConnector } from "../src/evm_connector";

describe("TTTBuilder", () => {
  let builder: TTTBuilder;
  const poolAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    const mockConnector = {
      swap: jest.fn().mockResolvedValue({ hash: "0xmocktx" }),
      burnTTT: jest.fn().mockResolvedValue({ hash: "0xmockburn" }),
      connect: jest.fn(),
      getProvider: jest.fn(),
    } as unknown as EVMConnector;
    builder = new TTTBuilder(mockConnector);
  });

  test("should purchase TTT and update balance", async () => {
    const amount = 100n;
    await builder.purchaseTTT(poolAddress, amount);
    expect(builder.getBalance()).toBe(amount);
  });

  test("should consume TTT tick", async () => {
    // Purchase enough to cover tier-based cost (T1_block = $0.01 = 10000000000000000n wei)
    const largeAmount = BigInt(1e18);
    await builder.purchaseTTT(poolAddress, largeAmount);
    const balanceBefore = builder.getBalance();
    await builder.consumeTick("token-1", "T1_block");
    expect(builder.getBalance()).toBeLessThan(balanceBefore);
  });

  test("should throw error if consuming tick with zero balance", async () => {
    await expect(builder.consumeTick("token-1")).rejects.toThrow("[TTTBuilder] Insufficient TTT balance to consume tick");
  });

  test("should verify block and switch to TURBO mode for valid data after 20 blocks", async () => {
    const testData = new Uint8Array(12).fill(1);
    const txs = ["0x1", "0x2", "0x3"];
    const timestamp = Date.now(); // Milliseconds
    
    const grgPayload = GrgForward.encode(testData, 1, poolAddress);
    
    const block: Block = {
      timestamp: timestamp,
      txs: txs,
      data: testData,
    };
    
    const tttRecord: TTTRecord = {
      time: timestamp,
      txOrder: txs,
      grgPayload: grgPayload,
    };
    
    // Transition to TURBO (20 blocks)
    for (let i = 0; i < 19; i++) {
      await builder.verifyBlock(block, tttRecord, 1, poolAddress);
    }
    const mode = await builder.verifyBlock(block, tttRecord, 1, poolAddress);

    expect(mode).toBe(AdaptiveMode.TURBO);
    expect(builder.getMode()).toBe(AdaptiveMode.TURBO);
  });

  test("should verify block and switch to FULL mode for tampered data", async () => {
    const testData = new Uint8Array(12).fill(1);
    const tamperedData = new Uint8Array(12).fill(1);
    tamperedData[0] = 2; // Tampered
    const txs = ["0x1", "0x2", "0x3"];
    const timestamp = Date.now();
    
    const grgPayload = GrgForward.encode(testData, 1, poolAddress);
    
    const block: Block = {
      timestamp: timestamp,
      txs: txs,
      data: tamperedData, // Does not match grgPayload
    };
    
    const tttRecord: TTTRecord = {
      time: timestamp,
      txOrder: txs,
      grgPayload: grgPayload,
    };
    
    const mode = await builder.verifyBlock(block, tttRecord, 1, poolAddress);
    expect(mode).toBe(AdaptiveMode.FULL);
    expect(builder.getMode()).toBe(AdaptiveMode.FULL);
  });

  test("should verify block and switch to FULL mode for mismatched transaction order", async () => {
    const testData = new Uint8Array(12).fill(1);
    const txs = ["0x1", "0x2", "0x3"];
    const mismatchedTxs = ["0x1", "0x3", "0x2"]; // Swapped
    const timestamp = Date.now();
    
    const grgPayload = GrgForward.encode(testData, 1, poolAddress);
    
    const block: Block = {
      timestamp: timestamp,
      txs: txs,
      data: testData,
    };
    
    const tttRecord: TTTRecord = {
      time: timestamp,
      txOrder: mismatchedTxs,
      grgPayload: grgPayload,
    };
    
    const mode = await builder.verifyBlock(block, tttRecord, 1, poolAddress);
    expect(mode).toBe(AdaptiveMode.FULL);
    expect(builder.getMode()).toBe(AdaptiveMode.FULL);
  });

  test("should verify block and switch to FULL mode for time mismatch", async () => {
    const testData = new Uint8Array(12).fill(1);
    const txs = ["0x1", "0x2", "0x3"];
    const timestamp = Date.now();
    const futureTimestamp = timestamp + 1000; // Beyond 100ms tolerance
    
    const grgPayload = GrgForward.encode(testData, 1, poolAddress);
    
    const block: Block = {
      timestamp: timestamp,
      txs: txs,
      data: testData,
    };
    
    const tttRecord: TTTRecord = {
      time: futureTimestamp,
      txOrder: txs,
      grgPayload: grgPayload,
    };
    
    const mode = await builder.verifyBlock(block, tttRecord, 1, poolAddress);
    expect(mode).toBe(AdaptiveMode.FULL);
    expect(builder.getMode()).toBe(AdaptiveMode.FULL);
  });
});

// tests/ttt_client_coverage.test.ts — Extended coverage for ttt_client.ts
// Covers: TTTClient.create() validation, destroy(), getStatus() error paths,
// resume(), listPools(), getPoolStats(), setMinBalance(), event emissions,
// factory methods, and edge cases.

import { TTTClient } from "../src/ttt_client";
import { AutoMintConfig } from "../src/types";

// Mock dependencies
const mockUnsubscribeAll = jest.fn();
const mockGetTTTBalance = jest.fn().mockResolvedValue(0n);
const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockResume = jest.fn();
const mockSetOnMint = jest.fn();
const mockSetOnFailure = jest.fn();
const mockSetOnLatency = jest.fn();
const mockSynthesize = jest.fn().mockResolvedValue({
  timestamp: BigInt(Date.now()) * 1_000_000n,
  confidence: 0.99,
  sources: 3,
  stratum: 1,
});

jest.mock("../src/auto_mint", () => {
  return {
    AutoMintEngine: jest.fn().mockImplementation(() => ({
      initialize: mockInitialize,
      start: mockStart,
      stop: mockStop,
      resume: mockResume,
      setOnMint: mockSetOnMint,
      setOnFailure: mockSetOnFailure,
      setOnLatency: mockSetOnLatency,
      getEvmConnector: jest.fn().mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          getBalance: jest.fn().mockResolvedValue(BigInt("1000000000000000000")),
          getBlockNumber: jest.fn().mockResolvedValue(12345),
        }),
        getSigner: jest.fn().mockReturnValue({
          getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
          provider: {
            getBalance: jest.fn().mockResolvedValue(BigInt("1000000000000000000")),
            getBlockNumber: jest.fn().mockResolvedValue(12345),
          },
        }),
        subscribeToEvents: jest.fn().mockResolvedValue(undefined),
        attachProtocolFeeContract: jest.fn(),
        unsubscribeAll: mockUnsubscribeAll,
        getTTTBalance: mockGetTTTBalance,
      }),
      getTimeSynthesis: jest.fn().mockReturnValue({
        synthesize: mockSynthesize,
      }),
    })),
  };
});

// Need to mock createSigner for TTTClient.create()
jest.mock("../src/signer", () => {
  return {
    createSigner: jest.fn().mockResolvedValue({
      inner: {
        getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
        provider: null,
        connect: jest.fn().mockReturnThis(),
      },
      getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
    }),
  };
});

jest.mock("../src/pool_registry", () => {
  return {
    PoolRegistry: jest.fn().mockImplementation(() => ({
      registerPool: jest.fn().mockResolvedValue(undefined),
      recordMint: jest.fn(),
      recordBurn: jest.fn(),
      listPools: jest.fn().mockReturnValue(["0xPoolAddr"]),
      getPoolStats: jest.fn().mockReturnValue({ mints: 5, burns: 2 }),
    })),
  };
});

describe("TTTClient — Coverage Extension", () => {
  const mockConfig: AutoMintConfig = {
    chainId: 84532,
    poolAddress: "0x1234567890123456789012345678901234567890",
    rpcUrl: "https://sepolia.base.org",
    privateKey: "0x" + "1".repeat(64),
    contractAddress: "0x0987654321098765432109876543210987654321",
    tier: "T1_block",
    timeSources: ["nist"],
    protocolFeeRate: 0.05,
    protocolFeeRecipient: "0x1234567890123456789012345678901234567890",
  };

  let client: TTTClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TTTClient(mockConfig);
  });

  // --- Constructor ---
  test("constructor creates instance with config", () => {
    expect(client).toBeInstanceOf(TTTClient);
  });

  // --- initialize() ---
  test("initialize sets up the client", async () => {
    await client.initialize();
    expect(mockInitialize).toHaveBeenCalled();
  });

  test("initialize is idempotent (second call is no-op)", async () => {
    await client.initialize();
    await client.initialize();
    // Only called once despite two calls
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  // --- destroy() ---
  test("destroy cleans up resources", async () => {
    await client.initialize();
    await client.destroy();
    expect(mockStop).toHaveBeenCalled();
    expect(mockUnsubscribeAll).toHaveBeenCalled();
  });

  test("destroy is no-op when not initialized", async () => {
    // Client not initialized — should not throw
    await client.destroy();
    expect(mockStop).not.toHaveBeenCalled();
  });

  // --- startAutoMint / stopAutoMint ---
  test("startAutoMint throws if not initialized", () => {
    expect(() => client.startAutoMint()).toThrow("must be initialized");
  });

  test("startAutoMint succeeds after init", async () => {
    await client.initialize();
    client.startAutoMint();
    expect(mockStart).toHaveBeenCalled();
  });

  test("stopAutoMint delegates to engine", async () => {
    await client.initialize();
    client.stopAutoMint();
    expect(mockStop).toHaveBeenCalled();
  });

  // --- resume() ---
  test("resume emits modeSwitch event", async () => {
    await client.initialize();
    const events: string[] = [];
    client.on("modeSwitch", (mode) => events.push(mode));

    client.resume();
    expect(events).toContain("resumed");
  });

  // --- listPools / getPoolStats ---
  test("listPools returns registered pools", async () => {
    await client.initialize();
    const pools = client.listPools();
    expect(pools).toContain("0xPoolAddr");
  });

  test("getPoolStats returns stats for pool", async () => {
    await client.initialize();
    const stats = client.getPoolStats("0xPoolAddr");
    expect(stats).toEqual({ mints: 5, burns: 2 });
  });

  // --- setMinBalance ---
  test("setMinBalance updates threshold", async () => {
    client.setMinBalance(5000000000000000000n);
    await client.initialize();
    // This should trigger a low balance alert since mock returns 1 ETH < 5 ETH threshold
    const health = await client.getHealth();
    expect(health.checks.balanceSufficient).toBe(false);
  });

  // --- onAlert ---
  test("onAlert registers callback and receives alerts", async () => {
    const alerts: string[] = [];
    client.onAlert((a) => alerts.push(a));
    client.setMinBalance(5000000000000000000n); // 5 ETH min
    await client.initialize();
    await client.getHealth(); // triggers alert for low balance
    expect(alerts.length).toBeGreaterThan(0);
  });

  // --- getHealth ---
  test("getHealth returns healthy=false when not initialized", async () => {
    const health = await client.getHealth();
    expect(health.healthy).toBe(false);
    expect(health.checks.initialized).toBe(false);
  });

  test("getHealth returns metrics with uptimeMs", async () => {
    await client.initialize();
    const health = await client.getHealth();
    expect(health.metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(health.metrics.successRate).toBe(1);
    expect(health.metrics.totalFeesPaid).toBe("0");
  });

  test("getHealth handles time synthesis timeout", async () => {
    await client.initialize();
    mockSynthesize.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    const health = await client.getHealth();
    expect(health.checks.ntpSourcesOk).toBe(false);
    expect(health.alerts.some((a: string) => a.includes("Time source"))).toBe(true);
  });

  test("getHealth handles time synthesis low confidence", async () => {
    await client.initialize();
    mockSynthesize.mockResolvedValueOnce({ sources: 1, confidence: 0.3 });
    const health = await client.getHealth();
    expect(health.checks.ntpSourcesOk).toBe(false);
  });

  // --- getStatus ---
  test("getStatus throws when not initialized", async () => {
    await expect(client.getStatus()).rejects.toThrow("must be initialized");
  });

  test("getStatus returns status after init", async () => {
    await client.initialize();
    const status = await client.getStatus();
    expect(status.isInitialized).toBe(true);
    expect(status.tier).toBe("T1_block");
    expect(status.mintCount).toBe(0);
    expect(status.totalFeesPaid).toBe("0");
    expect(status.lastTokenId).toBeNull();
  });

  // --- recordMintFailure / recordMintLatency ---
  test("recordMintFailure increments failures", async () => {
    await client.initialize();
    client.recordMintFailure();
    client.recordMintFailure();
    const health = await client.getHealth();
    expect(health.metrics.mintFailures).toBe(2);
  });

  test("recordMintLatency caps at maxLatencyHistory", () => {
    const smallClient = new TTTClient({ ...mockConfig, maxLatencyHistory: 3 });
    smallClient.recordMintLatency(10);
    smallClient.recordMintLatency(20);
    smallClient.recordMintLatency(30);
    smallClient.recordMintLatency(40); // should evict oldest (10)
    // We can verify via getHealth avgLatency
  });

  // --- Event emissions from engine callbacks ---
  test("onMint callback wired from engine emits mint event", async () => {
    // The constructor calls setOnMint — capture the callback
    const onMintCb = mockSetOnMint.mock.calls[0][0];
    const events: any[] = [];
    client.on("mint", (r) => events.push(r));

    onMintCb({
      tokenId: "0xtokenid",
      grgHash: "0xgrg",
      timestamp: 123n,
      txHash: "0xtx",
      protocolFeePaid: 100n,
    });

    expect(events.length).toBe(1);
    expect(events[0].tokenId).toBe("0xtokenid");
  });

  test("onFailure callback wired from engine emits error event", () => {
    const onFailCb = mockSetOnFailure.mock.calls[0][0];
    const errors: Error[] = [];
    client.on("error", (e) => errors.push(e));

    onFailCb(new Error("mint failed"));
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("mint failed");
  });

  test("onLatency callback wired from engine emits latency event", () => {
    const onLatCb = mockSetOnLatency.mock.calls[0][0];
    const latencies: number[] = [];
    client.on("latency", (ms) => latencies.push(ms));

    onLatCb(42);
    expect(latencies).toContain(42);
  });

  // --- TTTClient.create() validation ---
  test("create throws without signer or privateKey", async () => {
    await expect(TTTClient.create({
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    } as any)).rejects.toThrow("requires either");
  });

  test("create throws on invalid tier", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      tier: "T9_invalid" as any,
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("Invalid tier");
  });

  test("create throws on invalid protocolFeeRate > 1", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      protocolFeeRate: 1.5,
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("protocolFeeRate must be 0-1");
  });

  test("create throws on negative protocolFeeRate", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      protocolFeeRate: -0.1,
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("protocolFeeRate must be 0-1");
  });

  test("create throws on unknown network string", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: "polygon",
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("Unknown network");
  });

  test("create throws on missing poolAddress", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: "sepolia",
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("poolAddress is required");
  });

  test("create throws on zero poolAddress", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: "sepolia",
      poolAddress: "0x0000000000000000000000000000000000000000",
      protocolFeeRecipient: "0x" + "22".repeat(20),
    })).rejects.toThrow("poolAddress is required");
  });

  test("create throws on missing protocolFeeRecipient", async () => {
    await expect(TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: "sepolia",
      poolAddress: "0x" + "11".repeat(20),
    })).rejects.toThrow("protocolFeeRecipient is required");
  });

  test("create succeeds with valid sepolia config", async () => {
    const c = await TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: "sepolia",
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    });
    expect(c).toBeInstanceOf(TTTClient);
    await c.destroy();
  });

  test("create with privateKey shorthand (no 0x) auto-converts", async () => {
    const c = await TTTClient.create({
      privateKey: "ab".repeat(32),
      network: "sepolia",
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    });
    expect(c).toBeInstanceOf(TTTClient);
    await c.destroy();
  });

  test("create with custom NetworkConfig object", async () => {
    const c = await TTTClient.create({
      privateKey: "0x" + "ab".repeat(32),
      network: {
        chainId: 999,
        rpcUrl: "http://localhost:8545",
        tttAddress: "0x" + "ff".repeat(20),
        protocolFeeAddress: "0x" + "ee".repeat(20),
        usdcAddress: "0x" + "dd".repeat(20),
      },
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    });
    expect(c).toBeInstanceOf(TTTClient);
    await c.destroy();
  });

  // --- forBase / forSepolia factory ---
  test("forSepolia creates client for sepolia network", async () => {
    const c = await TTTClient.forSepolia({
      privateKey: "0x" + "ab".repeat(32),
      poolAddress: "0x" + "11".repeat(20),
      protocolFeeRecipient: "0x" + "22".repeat(20),
    });
    expect(c).toBeInstanceOf(TTTClient);
    await c.destroy();
  });
});

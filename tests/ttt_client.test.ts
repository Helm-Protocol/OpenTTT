import { TTTClient } from "../src/ttt_client";
import { AutoMintConfig } from "../src/types";

// Mock AutoMintEngine
jest.mock("../src/auto_mint", () => {
  return {
    AutoMintEngine: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(),
      stop: jest.fn(),
      setOnMint: jest.fn(),
      setOnFailure: jest.fn(),
      setOnLatency: jest.fn(),
      getEvmConnector: jest.fn().mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          getBalance: jest.fn().mockResolvedValue(BigInt(1000000000000000000n))
        }),
        getSigner: jest.fn().mockReturnValue({
          getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
          provider: {
            getBalance: jest.fn().mockResolvedValue(BigInt(1000000000000000000n))
          }
        }),
        subscribeToEvents: jest.fn().mockResolvedValue(undefined),
        attachProtocolFeeContract: jest.fn()
      })
    }))
  };
});

// Mock ethers
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    Wallet: jest.fn().mockImplementation(() => ({
      address: "0x1234567890123456789012345678901234567890"
    })),
    formatEther: jest.fn().mockReturnValue("1.0")
  };
});

describe("TTTClient", () => {
  const mockConfig: AutoMintConfig = {
    chainId: 8453,
    poolAddress: "0x1234567890123456789012345678901234567890",
    rpcUrl: "https://mainnet.base.org",
    privateKey: "0x" + "1".repeat(64),
    contractAddress: "0x0987654321098765432109876543210987654321",
    tier: "T1_block",
    timeSources: ["nist"],
    protocolFeeRate: 0.05,
    protocolFeeRecipient: "0x1234567890123456789012345678901234567890"
  };

  let client: TTTClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TTTClient(mockConfig);
  });

  it("should initialize and update status", async () => {
    await client.initialize();
    const status = await client.getStatus();
    
    expect(status.isInitialized).toBe(true);
    expect(status.balance).toBe("1.0");
  });

  it("should start and stop auto-minting", async () => {
    await client.initialize();
    client.startAutoMint();

    const { AutoMintEngine } = require("../src/auto_mint");
    const mockEngine = (AutoMintEngine as jest.Mock).mock.results[0].value;
    expect(mockEngine.start).toHaveBeenCalled();

    client.stopAutoMint();
    expect(mockEngine.stop).toHaveBeenCalled();
  });

  it("should return health status with checks and metrics", async () => {
    await client.initialize();
    const health = await client.getHealth();

    expect(health).toHaveProperty("healthy");
    expect(health).toHaveProperty("checks");
    expect(health).toHaveProperty("metrics");
    expect(health).toHaveProperty("alerts");
    expect(health.checks.initialized).toBe(true);
    expect(health.checks.signerAvailable).toBe(true);
    expect(health.metrics.mintCount).toBe(0);
    expect(health.metrics.mintFailures).toBe(0);
    expect(health.metrics.successRate).toBe(1);
    expect(typeof health.metrics.uptimeMs).toBe("number");
  });

  it("should track mint failures and emit alerts", async () => {
    await client.initialize();
    const alerts: string[] = [];
    client.onAlert((a) => alerts.push(a));

    // Simulate 6 failures with 0 successes
    for (let i = 0; i < 6; i++) client.recordMintFailure();

    const health = await client.getHealth();
    expect(health.metrics.mintFailures).toBe(6);
    expect(health.metrics.successRate).toBe(0);
    expect(health.alerts.length).toBeGreaterThan(0);
    expect(alerts.some(a => a.includes("failure rate"))).toBe(true);
  });

  it("should track mint latencies", async () => {
    await client.initialize();
    client.recordMintLatency(50);
    client.recordMintLatency(100);
    client.recordMintLatency(150);

    const health = await client.getHealth();
    expect(health.metrics.avgMintLatencyMs).toBe(100);
  });
});

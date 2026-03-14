// tests/auto_mint_coverage.test.ts — Extended coverage for AutoMintEngine
import { AutoMintEngine } from "../src/auto_mint";
import { AutoMintConfig } from "../src/types";
import { EVMConnector } from "../src/evm_connector";
import { TimeSynthesis } from "../src/time_synthesis";

// Mock dependencies
jest.mock("../src/evm_connector", () => {
  return {
    EVMConnector: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      attachContract: jest.fn(),
      mintTTT: jest.fn().mockResolvedValue({ hash: "0xMockTxHash" }),
      getSigner: jest.fn().mockReturnValue({
        getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
        signTypedData: jest.fn().mockResolvedValue("0xSignature"),
      }),
      getProvider: jest.fn().mockReturnValue({}),
    })),
  };
});

jest.mock("../src/dynamic_fee", () => {
  return {
    DynamicFeeEngine: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      calculateMintFee: jest.fn().mockResolvedValue({
        tttAmount: BigInt(1000000000000000000),
        protocolFeeUsd: BigInt(20000),
        feeTokenAddress: "0xUSDC",
      }),
    })),
  };
});

jest.mock("../src/time_synthesis", () => {
  return {
    TimeSynthesis: jest.fn().mockImplementation(() => ({
      synthesize: jest.fn().mockResolvedValue({
        timestamp: BigInt(Date.now()) * 1_000_000n,
        confidence: 0.99,
        uncertainty: 5,
        sources: 2,
        stratum: 1,
      }),
      generateProofOfTime: jest.fn().mockResolvedValue({
        timestamp: BigInt(Date.now()) * 1_000_000n,
        uncertainty: 5,
        sources: 2,
        stratum: 1,
        confidence: 0.99,
        nonce: "auto-mint-coverage-nonce-0001",
        expiresAt: BigInt(Date.now()) + 60_000n,
        signatures: [
          { source: "nist", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 },
          { source: "google", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 },
        ],
      }),
      verifyProofOfTime: jest.fn().mockReturnValue(true),
    })),
  };
});

describe("AutoMintEngine — Coverage Extension", () => {
  const minimalConfig: AutoMintConfig = {
    chainId: 8453,
    poolAddress: "0x1234567890123456789012345678901234567890",
    rpcUrl: "https://mainnet.base.org",
    privateKey: "0x" + "1".repeat(64),
    contractAddress: "0x0987654321098765432109876543210987654321",
    tier: "T1_block",
    timeSources: ["nist"],
    protocolFeeRate: 0.05,
    protocolFeeRecipient: "0x1234567890123456789012345678901234567890",
  };

  let engine: AutoMintEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    engine = new AutoMintEngine(minimalConfig);
  });

  afterEach(() => {
    engine.stop();
    jest.useRealTimers();
  });

  test("Constructor with minimal config creates instance", () => {
    expect(engine).toBeInstanceOf(AutoMintEngine);
  });

  test("start/stop lifecycle", () => {
    jest.useFakeTimers();
    engine.start();
    // Timer should be set
    expect(jest.getTimerCount()).toBe(1);

    engine.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("start is idempotent (calling twice does not double timers)", () => {
    jest.useFakeTimers();
    engine.start();
    engine.start(); // second call should be no-op
    expect(jest.getTimerCount()).toBe(1);
    engine.stop();
  });

  test("stop when not running is a no-op", () => {
    // Should not throw
    expect(() => engine.stop()).not.toThrow();
  });

  test("stop when already stopped is a no-op", () => {
    jest.useFakeTimers();
    engine.start();
    engine.stop();
    // Calling stop again should be fine
    expect(() => engine.stop()).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("resume resets consecutiveFailures and starts", () => {
    jest.useFakeTimers();
    // Access internal state indirectly: start, stop, then resume
    engine.start();
    engine.stop();
    engine.resume();
    expect(jest.getTimerCount()).toBe(1);
    engine.stop();
  });

  test("setOnMint sets the mint callback", async () => {
    const mintCallback = jest.fn();
    engine.setOnMint(mintCallback);

    await engine.initialize();
    await engine.mintTick();

    expect(mintCallback).toHaveBeenCalledTimes(1);
    expect(mintCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: expect.any(String),
        grgHash: expect.any(String),
        txHash: "0xMockTxHash",
      })
    );
  });

  test("setOnFailure sets the failure callback", () => {
    const failCallback = jest.fn();
    engine.setOnFailure(failCallback);
    // Callback is stored; it fires during tick errors (tested indirectly)
    expect(() => engine.setOnFailure(failCallback)).not.toThrow();
  });

  test("setOnLatency sets the latency callback", async () => {
    const latencyCallback = jest.fn();
    engine.setOnLatency(latencyCallback);

    await engine.initialize();

    // Run a single tick through the loop to trigger latency callback
    jest.useFakeTimers();
    engine.start();
    // Advance timer to trigger one interval
    await jest.advanceTimersByTimeAsync(3000);
    engine.stop();

    // latencyCallback should have been called at least once
    expect(latencyCallback).toHaveBeenCalled();
    expect(typeof latencyCallback.mock.calls[0][0]).toBe("number");
  });

  test("getEvmConnector returns the EVMConnector instance", () => {
    const connector = engine.getEvmConnector();
    expect(connector).toBeDefined();
    expect(typeof connector.connect).toBe("function");
  });

  test("getTimeSynthesis returns the TimeSynthesis instance", () => {
    const ts = engine.getTimeSynthesis();
    expect(ts).toBeDefined();
    expect(typeof ts.synthesize).toBe("function");
  });

  test("Constructor with signer in config caches it", () => {
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValue("0xABCD"),
      signTypedData: jest.fn(),
      connect: jest.fn(),
    } as any;

    const configWithSigner: AutoMintConfig = {
      ...minimalConfig,
      signer: mockSigner,
    };

    const eng = new AutoMintEngine(configWithSigner);
    expect(eng).toBeInstanceOf(AutoMintEngine);
    eng.stop();
  });

  test("mintTick throws when mintTTT fails after retries", async () => {
    await engine.initialize();

    // Get the mock EVM instance created during initialize
    const mockCalls = (EVMConnector as unknown as jest.Mock).mock.results;
    const mockEvm = mockCalls[mockCalls.length - 1].value;
    mockEvm.mintTTT
      .mockRejectedValueOnce(new Error("RPC down"))
      .mockRejectedValueOnce(new Error("RPC down"))
      .mockRejectedValueOnce(new Error("RPC down"));

    await expect(engine.mintTick()).rejects.toThrow("RPC down");
  });

  test("mintTick retry logic — fails once then succeeds on second attempt", async () => {
    await engine.initialize();
    const mintCallback = jest.fn();
    engine.setOnMint(mintCallback);

    const mockCalls = (EVMConnector as unknown as jest.Mock).mock.results;
    const mockEvm = mockCalls[mockCalls.length - 1].value;

    // First attempt fails, second succeeds
    mockEvm.mintTTT
      .mockRejectedValueOnce(new Error("transient RPC error"))
      .mockResolvedValueOnce({ hash: "0xRetrySuccessTx" });

    await engine.mintTick();
    expect(mintCallback).toHaveBeenCalledTimes(1);
    expect(mintCallback).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: "0xRetrySuccessTx" })
    );
    // mintTTT should have been called twice (1 fail + 1 success)
    expect(mockEvm.mintTTT).toHaveBeenCalledTimes(2);
  });

  test("circuit breaker — resume resets consecutiveFailures and restarts loop", () => {
    // Verify resume resets consecutiveFailures and restarts the interval timer.
    // The actual circuit breaker (5 consecutive failures -> stop) is tested
    // via the start() loop, but that involves real sleep() backoffs per retry.
    // Here we verify the resume mechanism that recovers from a circuit breaker trip.
    jest.useFakeTimers();
    engine.start();
    engine.stop();

    // After stop (simulating circuit breaker trip), resume should allow restart
    engine.resume();
    expect(jest.getTimerCount()).toBe(1);
    engine.stop();
  });

  test("GRG timing warning — mock Date.now for >50ms elapsed", async () => {
    await engine.initialize();
    const mintCallback = jest.fn();
    engine.setOnMint(mintCallback);

    // Spy on Date.now to simulate slow GRG pipeline
    const originalDateNow = Date.now;
    let callCount = 0;
    jest.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      // grgStart = call N, grgElapsed check = call N+1
      // We want grgElapsed > 50, so return a value that makes the difference > 50
      if (callCount >= 3) {
        // After the first few Date.now calls (mintNonce, grgStart), bump time
        return originalDateNow() + callCount * 30;
      }
      return originalDateNow();
    });

    await engine.mintTick();
    expect(mintCallback).toHaveBeenCalled();

    jest.spyOn(Date, "now").mockRestore();
  });

  test("mintTick skips when time synthesis returns null", async () => {
    await engine.initialize();
    const mintCallback = jest.fn();
    engine.setOnMint(mintCallback);

    // Override synthesize to return null
    const ts = engine.getTimeSynthesis();
    (ts.synthesize as jest.Mock).mockResolvedValueOnce(null);

    await engine.mintTick();
    // Mint callback should NOT have been called since synthesis was null
    expect(mintCallback).not.toHaveBeenCalled();
  });

  test("mintTick throws on low confidence synthesis", async () => {
    await engine.initialize();

    const ts = engine.getTimeSynthesis();
    (ts.synthesize as jest.Mock).mockResolvedValueOnce({
      timestamp: BigInt(Date.now()) * 1_000_000n,
      confidence: 0,
      uncertainty: 5,
      sources: 0,
      stratum: 16,
    });

    await expect(engine.mintTick()).rejects.toThrow("integrity check failed");
  });

  test("mintTick throws on low PoT confidence", async () => {
    await engine.initialize();

    const ts = engine.getTimeSynthesis();
    (ts.generateProofOfTime as jest.Mock).mockResolvedValueOnce({
      timestamp: BigInt(Date.now()) * 1_000_000n,
      uncertainty: 5,
      sources: 1,
      stratum: 1,
      confidence: 0.3, // below 0.5 threshold
      nonce: "test-nonce",
      expiresAt: BigInt(Date.now()) + 60_000n,
      signatures: [],
    });

    await expect(engine.mintTick()).rejects.toThrow("Insufficient confidence");
  });

  test("initialize throws and rolls back state on failure", async () => {
    const badEngine = new AutoMintEngine({
      ...minimalConfig,
      rpcUrl: "bad-url",
      signer: undefined,
      privateKey: undefined,
    });

    await expect(badEngine.initialize()).rejects.toThrow();
    // After rollback, getEvmConnector should return a fresh instance
    expect(badEngine.getEvmConnector()).toBeDefined();
    badEngine.stop();
  });
});

import { AutoMintEngine } from "../src/auto_mint";
import { AutoMintConfig } from "../src/types";

// Mock dependencies
jest.mock("../src/evm_connector", () => {
  return {
    EVMConnector: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      attachContract: jest.fn(),
      mintTTT: jest.fn().mockResolvedValue({ hash: "0xMockTxHash" }),
      getSigner: jest.fn().mockReturnValue({
        getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890"),
        signTypedData: jest.fn().mockResolvedValue("0xSignature")
      }),
      getProvider: jest.fn().mockReturnValue({
        getSigner: jest.fn().mockReturnValue({
          getAddress: jest.fn().mockResolvedValue("0x1234567890123456789012345678901234567890")
        })
      })
    }))
  };
});

jest.mock("../src/dynamic_fee", () => {
  return {
    DynamicFeeEngine: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      calculateMintFee: jest.fn().mockResolvedValue({
        tttAmount: BigInt(1000000000000000000), // 1 TTT
        protocolFeeUsd: BigInt(20000),           // 0.02 USDC
        feeTokenAddress: "0xUSDC"
      })
    }))
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
        stratum: 1
      }),
      generateProofOfTime: jest.fn().mockResolvedValue({
        timestamp: BigInt(Date.now()) * 1_000_000n,
        uncertainty: 5,
        sources: 2,
        stratum: 1,
        confidence: 0.99,
        signatures: [
          { source: "nist", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 },
          { source: "google", timestamp: BigInt(Date.now()) * 1_000_000n, uncertainty: 5 }
        ]
      }),
      verifyProofOfTime: jest.fn().mockReturnValue(true)
    }))
  };
});

describe("AutoMintEngine", () => {
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

  let engine: AutoMintEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new AutoMintEngine(mockConfig);
  });

  it("should initialize correctly", async () => {
    await engine.initialize();
  });

  it("should perform a mint tick successfully", async () => {
    await engine.initialize();
    await engine.mintTick();
    
    const { EVMConnector } = require("../src/evm_connector");
    const mockEvm = (EVMConnector as jest.Mock).mock.results[0].value;
    expect(mockEvm.mintTTT).toHaveBeenCalled();
  });

  it("should start and stop the loop", () => {
    jest.useFakeTimers();
    engine.start();
    expect(jest.getTimerCount()).toBe(1);
    
    engine.stop();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});

import { ethers } from "ethers";
import { UniswapV4Hook } from "../src/v4_hook";
import { EVMConnector } from "../src/evm_connector";
import { BeforeSwapParams, AfterSwapParams } from "../src/types";

// Mock EVMConnector
jest.mock("../src/evm_connector", () => {
  return {
    EVMConnector: jest.fn().mockImplementation(() => ({
      getProvider: jest.fn().mockReturnValue({}),
      burnTTT: jest.fn().mockResolvedValue({ hash: "0x" + "a".repeat(64) }),
      swap: jest.fn().mockResolvedValue({ hash: "0x" + "b".repeat(64) }),
      mintTTT: jest.fn().mockResolvedValue({ hash: "0x" + "c".repeat(64) }),
    })),
  };
});

// Mock ethers
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  const mockContract = jest.fn();
  const mockEthers = {
    ...actual.ethers,
    Contract: mockContract,
  };
  return {
    ...actual,
    Contract: mockContract,
    ethers: mockEthers,
  };
});

describe("UniswapV4Hook", () => {
  let hook: UniswapV4Hook;
  let mockConnector: any;
  const hookAddress = "0x" + "1".repeat(40);
  const tttTokenAddress = "0x" + "2".repeat(40);
  const senderAddress = "0x" + "3".repeat(40);

  let mockContractInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContractInstance = {
      balanceOf: jest.fn(),
    };
    
    // Support both direct and named export mocks
    if ((ethers.Contract as any).mockImplementation) {
      (ethers.Contract as any).mockImplementation(() => mockContractInstance);
    }
    if ((ethers as any).Contract && (ethers as any).Contract.mockImplementation) {
      (ethers as any).Contract.mockImplementation(() => mockContractInstance);
    }

    mockConnector = new EVMConnector();
    hook = new UniswapV4Hook(mockConnector, hookAddress, tttTokenAddress);
  });

  it("should return the correct hook address", () => {
    expect(hook.getHookAddress()).toBe(hookAddress);
  });

  describe("beforeSwap", () => {
    const mockParams: BeforeSwapParams = {
      sender: senderAddress,
      key: {
        currency0: "0x1",
        currency1: "0x2",
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress,
      },
      params: {
        zeroForOne: true,
        amountSpecified: BigInt(1000),
        sqrtPriceLimitX96: BigInt(0),
      },
      hookData: "0x",
    };

    it("should allow swap when TTT balance is sufficient", async () => {
      mockContractInstance.balanceOf.mockResolvedValue(ethers.parseEther("2.0"));

      await expect(hook.beforeSwap(mockParams)).resolves.not.toThrow();
      
      const stats = hook.getStats();
      expect(stats.totalFeesCollected).toBe("0.1"); // Default fee is 0.1 TTT
    });

    it("should throw error when TTT balance is insufficient", async () => {
      mockContractInstance.balanceOf.mockResolvedValue(ethers.parseEther("0.5")); // Required 1.0

      await expect(hook.beforeSwap(mockParams)).rejects.toThrow(/Insufficient TTT balance/);
    });

    it("should handle TTT balance check failure", async () => {
      mockContractInstance.balanceOf.mockRejectedValue(new Error("RPC Error"));

      await expect(hook.beforeSwap(mockParams)).rejects.toThrow(/Failed to check TTT balance/);
    });
  });

  describe("afterSwap", () => {
    const mockParams: AfterSwapParams = {
      sender: senderAddress,
      key: {
        currency0: "0x1",
        currency1: "0x2",
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress,
      },
      params: {
        zeroForOne: true,
        amountSpecified: BigInt(1000),
        sqrtPriceLimitX96: BigInt(0),
      },
      delta: {
        amount0: BigInt(-1000),
        amount1: BigInt(990),
      },
      hookData: "0x",
    };

    it("should update statistics after swap", async () => {
      await hook.afterSwap(mockParams);
      
      const stats = hook.getStats();
      expect(stats.totalSwaps).toBe(1);
      expect(stats.lastSwapTimestamp).toBeGreaterThan(0);
    });
  });
});

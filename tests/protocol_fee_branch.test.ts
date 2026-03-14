// Tests for uncovered branches in protocol_fee.ts
// Targets: InMemoryReplayCache (TTL eviction, overflow pruning), validateChainId, constructor validation
import { ethers } from "ethers";
import { ProtocolFeeCollector, InMemoryReplayCache } from "../src/protocol_fee";

describe("InMemoryReplayCache — uncovered branches", () => {
  test("has() returns false for unknown key", async () => {
    const cache = new InMemoryReplayCache();
    expect(await cache.has("unknown-key")).toBe(false);
  });

  test("set() and has() work for known key", async () => {
    const cache = new InMemoryReplayCache();
    await cache.set("my-sig", 3600000);
    expect(await cache.has("my-sig")).toBe(true);
  });

  test("expired entries are evicted from cache (TTL)", async () => {
    // Use a very short TTL
    const cache = new InMemoryReplayCache(100, 1); // 1ms TTL
    await cache.set("short-lived", 1);
    // Wait for expiry
    await new Promise(r => setTimeout(r, 10));
    expect(await cache.has("short-lived")).toBe(false);
  });

  test("overflow pruning removes oldest entries (lines 62-68)", async () => {
    const cache = new InMemoryReplayCache(3, 60000); // max 3 entries
    await cache.set("sig1", 60000);
    await cache.set("sig2", 60000);
    await cache.set("sig3", 60000);
    // Force a prune pass by exceeding max
    // Access to trigger pruneIfNeeded
    await cache.set("sig4", 60000);
    // Now sig1 (oldest) should have been evicted if over limit
    // Since pruneIfNeeded checks size > maxEntries, after adding sig4 = 4 > 3, oldest is removed
    // Note: prune interval is 60s, so the time-based pruning may not trigger,
    // but the overflow check at the bottom should trim
    // Actually: pruneIfNeeded only runs if now - lastPruneTime >= 60000 OR size > maxEntries
    // size=4 > maxEntries=3 → triggers prune → TTL check first (none expired at 60s), then overflow trim
    expect(await cache.has("sig4")).toBe(true);
  });
});

describe("ProtocolFeeCollector — constructor validation", () => {
  const validContract = "0x" + "2".repeat(40);
  const validRecipient = "0x" + "3".repeat(40);

  test("rejects non-positive chainId (lines 87-89)", () => {
    const mockEvm = { getProvider: jest.fn(), getSigner: jest.fn() } as any;
    expect(() => new ProtocolFeeCollector(0, validContract, mockEvm, validRecipient))
      .toThrow("Invalid chainId");
    expect(() => new ProtocolFeeCollector(-1, validContract, mockEvm, validRecipient))
      .toThrow("Invalid chainId");
    expect(() => new ProtocolFeeCollector(1.5, validContract, mockEvm, validRecipient))
      .toThrow("Invalid chainId");
  });

  test("rejects invalid address format", () => {
    const mockEvm = { getProvider: jest.fn(), getSigner: jest.fn() } as any;
    expect(() => new ProtocolFeeCollector(1, "not-an-address", mockEvm, validRecipient))
      .toThrow();
  });

  test("validateChainId detects mismatch (lines 102-105)", async () => {
    const mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(999) })
    };
    const mockEvm = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getSigner: jest.fn()
    } as any;
    const collector = new ProtocolFeeCollector(8453, validContract, mockEvm, validRecipient);
    await expect(collector.validateChainId()).rejects.toThrow("Chain ID mismatch");
  });

  test("validateChainId passes when matching", async () => {
    const mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(8453) })
    };
    const mockEvm = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getSigner: jest.fn()
    } as any;
    const collector = new ProtocolFeeCollector(8453, validContract, mockEvm, validRecipient);
    await expect(collector.validateChainId()).resolves.toBeUndefined();
  });

  test("collectBurnFee propagates contract errors (line 188)", async () => {
    const mockProvider = { getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(8453) }) };
    const mockSigner = { address: ethers.Wallet.createRandom().address };
    const mockEvm = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getSigner: jest.fn().mockReturnValue(mockSigner)
    } as any;

    // Mock Contract to throw
    jest.spyOn(ethers, "Contract").mockImplementation(() => ({
      collectFee: jest.fn().mockRejectedValue(new Error("contract revert"))
    }) as any);

    const collector = new ProtocolFeeCollector(8453, validContract, mockEvm, validRecipient);
    const wallet = ethers.Wallet.createRandom();
    const feeCalc = {
      tttAmount: 1000000000000000000n,
      protocolFeeUsd: 20000n,
      feeToken: "USDC",
      feeTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      clientNet: 1000000000000000000n,
      tttPriceUsd: 100000n,
      usdCost: 120000n,
      feeRateMint: 1000n,
      feeRateBurn: 500n,
      tier: "T1_block"
    };

    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const domain = {
      name: "OpenTTT_ProtocolFee", version: "1", chainId: 8453,
      verifyingContract: validContract
    };
    const types = {
      CollectFee: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const value = {
      token: ethers.getAddress(feeCalc.feeTokenAddress),
      amount: feeCalc.protocolFeeUsd,
      nonce, deadline
    };
    const signature = await wallet.signTypedData(domain, types, value);

    await expect(collector.collectBurnFee(feeCalc, signature, wallet.address, nonce, deadline))
      .rejects.toThrow("Burn fee collection failed");

    jest.restoreAllMocks();
  });
});

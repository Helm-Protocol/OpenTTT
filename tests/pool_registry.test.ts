import { PoolRegistry } from "../src/pool_registry";
import { ethers } from "ethers";

describe("PoolRegistry", () => {
  let poolRegistry: PoolRegistry;
  const poolAddress = "0x1234567890123456789012345678901234567890";
  const chainId = 1;

  beforeEach(() => {
    poolRegistry = new PoolRegistry();
  });

  test("should register a pool correctly", async () => {
    await poolRegistry.registerPool(chainId, poolAddress);
    const stats = poolRegistry.getPoolStats(poolAddress);
    expect(stats).not.toBeNull();
    expect(stats!.minted).toBe(0n);
    expect(stats!.burned).toBe(0n);
  });

  test("should generate tokenId and verify its pool", () => {
    const timestamp = BigInt(Date.now());
    const slotIndex = 1;
    
    const tokenId = poolRegistry.getTokenId(chainId, poolAddress, timestamp, slotIndex);
    
    expect(tokenId).toBeDefined();
    expect(tokenId.startsWith("0x")).toBe(true);
    expect(tokenId.length).toBe(66); // 0x + 64 hex chars
    
    expect(poolRegistry.isValidForPool(tokenId, poolAddress)).toBe(true);
    expect(poolRegistry.isValidForPool(tokenId, "0x0000000000000000000000000000000000000000")).toBe(false);
  });

  test("should handle case-insensitive pool addresses", async () => {
    const mixedCaseAddress = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
    await poolRegistry.registerPool(chainId, mixedCaseAddress);
    
    const stats = poolRegistry.getPoolStats(mixedCaseAddress.toLowerCase());
    expect(stats).toBeDefined();
    
    const tokenId = poolRegistry.getTokenId(chainId, mixedCaseAddress, 100n, 0);
    expect(poolRegistry.isValidForPool(tokenId, mixedCaseAddress.toUpperCase())).toBe(true);
  });

  test("should track minting and burning statistics", async () => {
    await poolRegistry.registerPool(chainId, poolAddress);
    
    poolRegistry.recordMint(poolAddress, 1000n);
    poolRegistry.recordBurn(poolAddress, 500n);
    
    const stats = poolRegistry.getPoolStats(poolAddress);
    expect(stats).not.toBeNull();
    expect(stats!.minted).toBe(1000n);
    expect(stats!.burned).toBe(500n);

    poolRegistry.recordMint(poolAddress, 250n);
    expect(poolRegistry.getPoolStats(poolAddress)!.minted).toBe(1250n);
  });

  test("should return null for unregistered pools", () => {
    const stats = poolRegistry.getPoolStats("0x0000000000000000000000000000000000000000");
    expect(stats).toBeNull();
  });

  test("tokenId generation should be deterministic", () => {
    const timestamp = 123456789n;
    const slotIndex = 42;
    
    const id1 = poolRegistry.getTokenId(chainId, poolAddress, timestamp, slotIndex);
    const id2 = poolRegistry.getTokenId(chainId, poolAddress, timestamp, slotIndex);
    
    expect(id1).toBe(id2);
    
    const id3 = poolRegistry.getTokenId(chainId, poolAddress, timestamp + 1n, slotIndex);
    expect(id1).not.toBe(id3);
  });
});

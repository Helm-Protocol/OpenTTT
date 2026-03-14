import { ethers } from "ethers";

/**
 * PoolRegistry - TTT Pool Registry
 * Manages registration of pools and tracks minting/burning statistics.
 */
export class PoolRegistry {
  // R4-P1-4: Capacity limit to prevent Sybil DoS
  private static readonly MAX_POOLS = 10000;
  private pools: Map<string, { chainId: number, minted: bigint, burned: bigint }> = new Map();
  // R8-5: Bounded token-to-pool map to prevent unbounded memory growth
  private static readonly MAX_TOKEN_MAPPINGS = 100000;
  private tokenToPool: Map<string, string> = new Map();

  /**
   * Register a new pool for TTT isolation.
   * @param chainId The chain ID where the pool is located.
   * @param poolAddress The address of the pool.
   */
  async registerPool(chainId: number, poolAddress: string): Promise<void> {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) throw new Error(`[PoolRegistry] Invalid pool address: ${poolAddress}`);
    const key = poolAddress.toLowerCase();
    if (!this.pools.has(key)) {
      // R4-P1-4: Sybil DoS prevention
      if (this.pools.size >= PoolRegistry.MAX_POOLS) {
        throw new Error(`[PoolRegistry] Registry full (max ${PoolRegistry.MAX_POOLS} pools). Cannot register more.`);
      }
      this.pools.set(key, { chainId, minted: 0n, burned: 0n });
    }
  }

  /**
   * Generate keccak256 tokenId based on chainId, poolAddress, timestamp and slotIndex.
   * @param chainId The chain ID.
   * @param poolAddress The pool address.
   * @param timestamp The timestamp of the TTT.
   * @param slotIndex The slot index.
   * @returns The generated tokenId as a hex string.
   */
  getTokenId(chainId: number, poolAddress: string, timestamp: bigint, slotIndex: number): string {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) throw new Error(`[PoolRegistry] Invalid pool address: ${poolAddress}`);
    // R2-P2-4: Validate slotIndex fits in uint32
    if (slotIndex < 0 || slotIndex > 0xFFFFFFFF || !Number.isInteger(slotIndex)) {
      throw new Error(`[PoolRegistry] slotIndex must be integer in [0, ${0xFFFFFFFF}], got: ${slotIndex}`);
    }
    
    // uint64 max value check
    if (timestamp > 18446744073709551615n) {
      throw new Error(`[PoolRegistry] Timestamp overflow: ${timestamp} exceeds uint64 max`);
    }

    const normalizedAddress = poolAddress.toLowerCase();
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const tokenId = ethers.keccak256(
      abiCoder.encode(
        ["uint256", "address", "uint64", "uint32"],
        [BigInt(chainId), normalizedAddress, timestamp, slotIndex]
      )
    );
    
    // Store mapping to support isValidForPool
    // R8-5: Evict oldest entry if at capacity (FIFO via Map insertion order)
    if (this.tokenToPool.size >= PoolRegistry.MAX_TOKEN_MAPPINGS) {
      const oldest = this.tokenToPool.keys().next().value;
      if (oldest !== undefined) this.tokenToPool.delete(oldest);
    }
    this.tokenToPool.set(tokenId, normalizedAddress);
    
    return tokenId;
  }

  /**
   * Verify if a tokenId belongs to a specific pool.
   * @param tokenId The tokenId to verify.
   * @param poolAddress The pool address to check against.
   * @returns True if the tokenId belongs to the pool.
   */
  isValidForPool(tokenId: string, poolAddress: string): boolean {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) return false;
    const normalizedAddress = poolAddress.toLowerCase();
    const registeredPool = this.tokenToPool.get(tokenId);
    return registeredPool === normalizedAddress;
  }

  /**
   * Get minting/burning statistics for a pool.
   * @param poolAddress The pool address.
   * @returns Statistics for the pool or null if not registered.
   */
  getPoolStats(poolAddress: string): { minted: bigint, burned: bigint } | null {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) return null;
    const normalizedAddress = poolAddress.toLowerCase();
    const stats = this.pools.get(normalizedAddress);
    if (!stats) {
      return null;
    }
    return { minted: stats.minted, burned: stats.burned };
  }

  /**
   * Record a minting event for a pool. (Internal/Helper method)
   * @param poolAddress The pool address.
   * @param amount The amount minted.
   */
  recordMint(poolAddress: string, amount: bigint): void {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) return;
    const normalizedAddress = poolAddress.toLowerCase();
    const stats = this.pools.get(normalizedAddress);
    if (stats) {
      stats.minted += amount;
    }
  }

  /**
   * Record a burning event for a pool. (Internal/Helper method)
   * @param poolAddress The pool address.
   * @param amount The amount burned.
   */
  recordBurn(poolAddress: string, amount: bigint): void {
    if (!poolAddress || !ethers.isAddress(poolAddress.toLowerCase())) return;
    const normalizedAddress = poolAddress.toLowerCase();
    const stats = this.pools.get(normalizedAddress);
    if (stats) {
      stats.burned += amount;
    }
  }

  /**
   * List all registered pool addresses.
   * @returns Array of pool addresses.
   */
  listPools(): string[] {
    return Array.from(this.pools.keys());
  }
}

/**
 * PoolRegistry - TTT Pool Registry
 * Manages registration of pools and tracks minting/burning statistics.
 */
export declare class PoolRegistry {
    private static readonly MAX_POOLS;
    private pools;
    private static readonly MAX_TOKEN_MAPPINGS;
    private tokenToPool;
    /**
     * Register a new pool for TTT isolation.
     * @param chainId The chain ID where the pool is located.
     * @param poolAddress The address of the pool.
     */
    registerPool(chainId: number, poolAddress: string): Promise<void>;
    /**
     * Generate keccak256 tokenId based on chainId, poolAddress, timestamp and slotIndex.
     * @param chainId The chain ID.
     * @param poolAddress The pool address.
     * @param timestamp The timestamp of the TTT.
     * @param slotIndex The slot index.
     * @returns The generated tokenId as a hex string.
     */
    getTokenId(chainId: number, poolAddress: string, timestamp: bigint, slotIndex: number): string;
    /**
     * Verify if a tokenId belongs to a specific pool.
     * @param tokenId The tokenId to verify.
     * @param poolAddress The pool address to check against.
     * @returns True if the tokenId belongs to the pool.
     */
    isValidForPool(tokenId: string, poolAddress: string): boolean;
    /**
     * Get minting/burning statistics for a pool.
     * @param poolAddress The pool address.
     * @returns Statistics for the pool or null if not registered.
     */
    getPoolStats(poolAddress: string): {
        minted: bigint;
        burned: bigint;
    } | null;
    /**
     * Record a minting event for a pool. (Internal/Helper method)
     * @param poolAddress The pool address.
     * @param amount The amount minted.
     */
    recordMint(poolAddress: string, amount: bigint): void;
    /**
     * Record a burning event for a pool. (Internal/Helper method)
     * @param poolAddress The pool address.
     * @param amount The amount burned.
     */
    recordBurn(poolAddress: string, amount: bigint): void;
    /**
     * List all registered pool addresses.
     * @returns Array of pool addresses.
     */
    listPools(): string[];
    /**
     * Serialize registry state to JSON for persistence across restarts.
     * Allows operators to restore pool registrations and stats without re-registering.
     */
    serialize(): string;
    /**
     * Reconstruct a PoolRegistry from previously serialized JSON state.
     */
    static deserialize(json: string): PoolRegistry;
}

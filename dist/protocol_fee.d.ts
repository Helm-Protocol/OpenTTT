import { FeeCalculation } from "./dynamic_fee";
import { EVMConnector } from "./evm_connector";
/**
 * Pluggable replay cache interface for signature deduplication.
 * Implement this to use Redis, database, or other external stores.
 */
export interface ReplayCache {
    has(key: string): Promise<boolean>;
    set(key: string, ttlMs: number): Promise<void>;
}
/**
 * Default in-memory replay cache with bounded size and TTL eviction.
 * Suitable for single-process deployments; use a distributed ReplayCache
 * implementation (e.g., Redis) for multi-node setups.
 */
export declare class InMemoryReplayCache implements ReplayCache {
    private entries;
    private readonly maxEntries;
    private readonly defaultTtlMs;
    private lastPruneTime;
    private static readonly PRUNE_INTERVAL_MS;
    constructor(maxEntries?: number, defaultTtlMs?: number);
    has(key: string): Promise<boolean>;
    set(key: string, ttlMs: number): Promise<void>;
    private pruneIfNeeded;
}
/**
 * ProtocolFeeCollector - Handles Helm protocol fee collection and verification.
 * Includes EIP-712 signature verification for x402 compliance.
 */
export declare class ProtocolFeeCollector {
    private totalCollected;
    private chainId;
    private verifyingContract;
    private replayCache;
    private evmConnector;
    private protocolFeeRecipient;
    private feeContract;
    constructor(chainId: number, verifyingContract: string, evmConnector: EVMConnector, protocolFeeRecipient: string, replayCache?: ReplayCache);
    /**
     * R3-P0-2: Verify chainId matches the actual connected network.
     * Must be called after EVMConnector.connect() to prevent cross-chain signature replay.
     */
    validateChainId(): Promise<void>;
    private getFeeContract;
    /**
     * Collect minting fee (Stablecoin).
     * @param feeCalc - Fee calculation result from DynamicFeeEngine.
     * @param signature - EIP-712 signature (required, for x402 verification).
     * @param user - Signer address.
     * @param nonce - Anti-replay nonce.
     * @param deadline - Signature expiration timestamp.
     */
    collectMintFee(feeCalc: FeeCalculation, signature: string, user: string, nonce: bigint, deadline: number): Promise<void>;
    /**
     * Collect burn fee.
     * @param feeCalc - Fee calculation result from DynamicFeeEngine.
     * @param signature - EIP-712 signature (required).
     * @param user - Signer address.
     * @param nonce - Anti-replay nonce.
     * @param deadline - Signature expiration timestamp.
     */
    collectBurnFee(feeCalc: FeeCalculation, signature: string, user: string, nonce: bigint, deadline: number): Promise<void>;
    /**
     * Return total fees collected so far.
     */
    getCollectedFees(): Promise<bigint>;
    /**
     * EIP-712 signature verification (x402 compliance).
     */
    private verifySignature;
}

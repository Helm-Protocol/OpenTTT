import { EventEmitter } from "events";
import { AutoMintConfig, TTTClientConfig, MintResult, HealthStatus } from "./types";
export { HealthStatus } from "./types";
/**
 * Typed event map for TTTClient EventEmitter.
 */
export interface TTTClientEvents {
    mint: [result: MintResult];
    error: [error: Error];
    alert: [alert: string];
    latency: [ms: number];
    modeSwitch: [mode: string];
}
/**
 * TTTClient - SDK entry point for DEX operators.
 * Initializes all internal modules and manages the auto-minting process.
 */
export declare class TTTClient extends EventEmitter {
    private config;
    private autoMintEngine;
    private poolRegistry;
    private isInitialized;
    private mintCount;
    private mintFailures;
    private totalFeesPaid;
    private signer;
    private lastTokenId;
    private mintLatencies;
    private maxLatencyHistory;
    private lastMintAt;
    private startedAt;
    private minBalanceWei;
    constructor(config: AutoMintConfig);
    /**
     * Static factory for Base Mainnet
     */
    static forBase(config: Omit<TTTClientConfig, 'network'>): Promise<TTTClient>;
    /**
     * Static factory for Base Sepolia
     */
    static forSepolia(config: Omit<TTTClientConfig, 'network'>): Promise<TTTClient>;
    /**
     * Universal factory to create and initialize a client
     */
    static create(config: TTTClientConfig): Promise<TTTClient>;
    /**
     * Gracefully shuts down the SDK, stopping all background processes and listeners.
     */
    destroy(): Promise<void>;
    /**
     * Initialize the SDK: RPC connection, time sources, fee engine wiring.
     */
    initialize(): Promise<void>;
    /**
     * Start the auto-minting process.
     */
    startAutoMint(): void;
    /**
     * Stop the auto-minting process.
     */
    stopAutoMint(): void;
    /**
     * Resume auto-minting after a circuit breaker trip.
     * Resets consecutive failure count and restarts the engine.
     */
    resume(): void;
    /**
     * List registered pools.
     */
    listPools(): string[];
    /**
     * Get stats for a specific pool.
     */
    getPoolStats(poolAddress: string): {
        minted: bigint;
        burned: bigint;
    } | null;
    /**
     * Set minimum ETH balance threshold for health alerts.
     */
    setMinBalance(weiAmount: bigint): void;
    /**
     * Register alert callback for real-time notifications.
     * Backward compatible: delegates to EventEmitter 'alert' event.
     */
    onAlert(callback: (alert: string) => void): void;
    private emitAlert;
    /**
     * Record a mint failure (called internally or externally).
     */
    recordMintFailure(): void;
    /**
     * Record mint latency in ms (called from auto-mint wrapper).
     */
    recordMintLatency(ms: number): void;
    /**
     * Production health check — liveness + readiness + metrics.
     * No exceptions: always returns a HealthStatus object.
     */
    getHealth(): Promise<HealthStatus>;
    /**
     * Return current SDK status and statistics (balance, mint count, fees, etc.)
     */
    getStatus(): Promise<{
        isInitialized: boolean;
        tier: string;
        mintCount: number;
        totalFeesPaid: string;
        balance: string;
        tttBalance: string;
        lastTokenId: string | null;
    }>;
}

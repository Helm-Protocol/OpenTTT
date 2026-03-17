import { TimeSynthesis } from "./time_synthesis";
import { EVMConnector } from "./evm_connector";
import { AutoMintConfig, MintResult } from "./types";
/**
 * AutoMintEngine - Automatic TTT minting engine.
 * Combines time synthesis, dynamic fee calculation, and EVM minting into a single loop.
 */
export declare class AutoMintEngine {
    private config;
    private timeSynthesis;
    private feeEngine;
    private evmConnector;
    private feeCollector;
    private timer;
    private isRunning;
    private isProcessing;
    private onMintCallback?;
    private onFailureCallback?;
    private onLatencyCallback?;
    private cachedSigner;
    private consecutiveFailures;
    private maxConsecutiveFailures;
    private potSigner;
    /** Monotonic counter appended to tokenId hash to prevent collision when two mints share the same nanosecond timestamp. */
    private mintNonce;
    /** Fire the GRG >50ms performance warning at most once per engine session. */
    private warnedGrgSlow;
    constructor(config: AutoMintConfig);
    getEvmConnector(): EVMConnector;
    getTimeSynthesis(): TimeSynthesis;
    setOnMint(callback: (result: MintResult) => void): void;
    setOnFailure(callback: (error: Error) => void): void;
    setOnLatency(callback: (ms: number) => void): void;
    /**
     * Initialize the engine (RPC connection and contract setup).
     */
    initialize(): Promise<void>;
    /**
     * Start the automatic minting loop.
     */
    start(): void;
    /**
     * Stop the automatic minting loop.
     */
    stop(): void;
    /**
     * Resume the minting loop after a circuit breaker trip.
     * Resets the consecutive failure counter and restarts the loop.
     */
    resume(): void;
    /**
     * Sleep helper for retry backoff.
     */
    private sleep;
    /**
     * Execute a single mint tick.
     * Time synthesis -> tokenId generation -> EVM mint call -> fee calculation/deduction.
     */
    mintTick(): Promise<void>;
    private signFeeMessage;
}

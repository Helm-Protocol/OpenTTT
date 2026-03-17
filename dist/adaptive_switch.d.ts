export declare enum AdaptiveMode {
    TURBO = "TURBO",// 50ms — Valid sequence, low latency
    FULL = "FULL"
}
export interface TTTRecord {
    time: number;
    txOrder: string[];
    grgPayload: Uint8Array[];
}
export interface Block {
    timestamp: number;
    txs: string[];
    data: Uint8Array;
}
/** Tier-based dynamic tolerance (ms) — auditor-requested upgrade */
export declare const TIER_TOLERANCE_MS: Record<string, number>;
export declare class AdaptiveSwitch {
    private windowSize;
    private threshold;
    private history;
    private currentMode;
    private minBlocks;
    private penaltyCooldown;
    private consecutiveFailures;
    private turboEntryThreshold;
    private turboMaintainThreshold;
    private tolerance;
    constructor(options?: {
        tolerance?: number;
    });
    /**
     * Core TTT mechanism: switches between Turbo/Full mode based on timestamp ordering match rate.
     */
    verifyBlock(block: Block, tttRecord: TTTRecord, chainId: number, poolAddress: string, tier?: string): AdaptiveMode;
    /**
     * Return fee discount rate based on current mode.
     * TURBO: 20% discount (incentivizes profitability).
     * FULL: No discount.
     */
    getFeeDiscount(): number;
    /**
     * Get current adaptive mode.
     */
    getCurrentMode(): AdaptiveMode;
    /**
     * Reset history (for testing).
     */
    reset(): void;
    /**
     * Serialize internal state to JSON for persistence across restarts.
     * Allows operators to avoid re-learning over 20 blocks after a restart.
     */
    serialize(): string;
    /**
     * Reconstruct an AdaptiveSwitch from previously serialized JSON state.
     */
    static deserialize(json: string): AdaptiveSwitch;
    private compareTransactionOrder;
}

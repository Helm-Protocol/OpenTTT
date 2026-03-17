export declare const TIER_USD_MICRO: Record<string, bigint>;
export declare const FEE_TIERS: {
    BOOTSTRAP: {
        mintFee: bigint;
        burnFee: bigint;
        threshold: bigint;
    };
    GROWTH: {
        mintFee: bigint;
        burnFee: bigint;
        threshold: bigint;
    };
    MATURE: {
        mintFee: bigint;
        burnFee: bigint;
        threshold: bigint;
    };
    PREMIUM: {
        mintFee: bigint;
        burnFee: bigint;
        threshold: bigint;
    };
};
export interface FeeCalculation {
    tttAmount: bigint;
    protocolFeeUsd: bigint;
    feeToken: string;
    feeTokenAddress: string;
    clientNet: bigint;
    tttPriceUsd: bigint;
    usdCost: bigint;
    feeRateMint: bigint;
    feeRateBurn: bigint;
    tier: string;
}
export interface PriceOracleConfig {
    poolAddress?: string;
    chainlinkFeed?: string;
    cacheDurationMs: number;
    fallbackPriceUsd: bigint;
}
export declare class DynamicFeeEngine {
    private priceCache;
    private provider;
    private rpcUrls;
    private config;
    private warnedSpotPrice;
    private static readonly RECOMMENDED_MAX_CACHE_MS;
    constructor(config: PriceOracleConfig);
    /**
     * Connect to an RPC provider. Accepts a single URL or an array of URLs
     * for multi-RPC fallback. On connection failure, the next URL is tried.
     */
    connect(rpcUrl: string | string[]): Promise<void>;
    /**
     * Iterate through stored RPC URLs and connect to the first one that succeeds.
     * Throws if all URLs fail.
     */
    private connectToNext;
    getTTTPriceUsd(): Promise<bigint>;
    /**
     * Force-invalidate price cache -- call when immediate price refresh is needed.
     */
    invalidateCache(): void;
    private fetchUniswapPrice;
    private fetchChainlinkPrice;
    getFeeRate(tttPriceUsd: bigint): {
        mintFee: bigint;
        burnFee: bigint;
        phase: string;
    };
    calculateMintFee(tier: string, tickCount?: number, feeToken?: string, feeTokenAddress?: string): Promise<FeeCalculation>;
    calculateBurnFee(tier: string, tickCount?: number, feeToken?: string, feeTokenAddress?: string): Promise<FeeCalculation>;
    calculateEmergencyMintFee(tier: string, tickCount?: number): Promise<FeeCalculation>;
}

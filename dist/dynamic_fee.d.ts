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
    private config;
    private static readonly RECOMMENDED_MAX_CACHE_MS;
    constructor(config: PriceOracleConfig);
    connect(rpcUrl: string): Promise<void>;
    getTTTPriceUsd(): Promise<bigint>;
    /**
     * 캐시 강제 무효화 — 외부에서 즉시 가격 갱신이 필요할 때 호출
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

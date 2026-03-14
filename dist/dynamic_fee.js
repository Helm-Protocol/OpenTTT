"use strict";
// sdk/src/dynamic_fee.ts — Dynamic Fee Engine
// TTT 시장가에 연동되어 자동으로 tick 비용 조정
// DEX 운영자는 tier만 설정 → 나머지 SDK가 자동 처리
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicFeeEngine = exports.FEE_TIERS = exports.TIER_USD_MICRO = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("./logger");
// Tier별 USD 목표 비용 (Scale: 1e6)
exports.TIER_USD_MICRO = {
    T0_epoch: 1000n, // $0.001 * 1e6
    T1_block: 10000n, // $0.01 * 1e6
    T2_slot: 240000n, // $0.24 * 1e6
    T3_micro: 12000000n, // $12 * 1e6
};
// Helm 프로토콜 수수료 구간 (Scale: 1e4, e.g., 500 = 5%)
exports.FEE_TIERS = {
    BOOTSTRAP: { mintFee: 500n, burnFee: 200n, threshold: 5000n }, // threshold: $0.005 * 1e6
    GROWTH: { mintFee: 1000n, burnFee: 300n, threshold: 50000n }, // threshold: $0.05 * 1e6
    MATURE: { mintFee: 1000n, burnFee: 500n, threshold: 500000n }, // threshold: $0.50 * 1e6
    PREMIUM: { mintFee: 800n, burnFee: 500n, threshold: -1n }, // Infinity replacement
};
class DynamicFeeEngine {
    priceCache = null;
    provider = null;
    config;
    // P2-3: Recommended max cache duration for DEX price freshness
    static RECOMMENDED_MAX_CACHE_MS = 5000;
    constructor(config) {
        // R3-P0-1: Prevent division by zero in all fee calculations
        if (config.fallbackPriceUsd <= 0n) {
            throw new Error(`[DynamicFee] fallbackPriceUsd must be > 0, got: ${config.fallbackPriceUsd}`);
        }
        this.config = config;
        // P2-3: Warn if cache duration is too long for DEX pricing
        if (config.cacheDurationMs > DynamicFeeEngine.RECOMMENDED_MAX_CACHE_MS) {
            logger_1.logger.warn(`[DynamicFee] cacheDurationMs=${config.cacheDurationMs}ms exceeds recommended ${DynamicFeeEngine.RECOMMENDED_MAX_CACHE_MS}ms for DEX pricing accuracy`);
        }
    }
    async connect(rpcUrl) {
        if (!rpcUrl)
            throw new Error("[DynamicFee] RPC URL is required");
        this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
    }
    async getTTTPriceUsd() {
        const now = Date.now();
        if (this.priceCache && (now - this.priceCache.timestamp) < this.config.cacheDurationMs) {
            return this.priceCache.price;
        }
        try {
            let price;
            // R4-P1-2: Chainlink FIRST (resistant to flash loan), Uniswap spot as fallback only
            if (this.config.chainlinkFeed && this.provider) {
                price = await this.fetchChainlinkPrice();
            }
            else if (this.config.poolAddress && this.provider) {
                logger_1.logger.warn("[DynamicFee] Using Uniswap spot price — vulnerable to flash loan manipulation. Configure chainlinkFeed for production.");
                price = await this.fetchUniswapPrice();
            }
            else {
                price = this.config.fallbackPriceUsd;
            }
            if (price <= 0n) {
                logger_1.logger.warn(`[DynamicFee] Invalid price ${price}, using fallback ${this.config.fallbackPriceUsd}`);
                price = this.config.fallbackPriceUsd;
                // R3-P0-1: Double-guard — fallback validated in constructor but belt-and-suspenders
                if (price <= 0n)
                    throw new Error("[DynamicFee] FATAL: fallbackPriceUsd is zero — cannot calculate fees");
            }
            this.priceCache = { price, timestamp: now };
            return price;
        }
        catch (error) {
            logger_1.logger.warn(`[DynamicFee] Price fetch failed, using fallback`);
            return this.config.fallbackPriceUsd;
        }
    }
    /**
     * 캐시 강제 무효화 — 외부에서 즉시 가격 갱신이 필요할 때 호출
     */
    invalidateCache() {
        this.priceCache = null;
        logger_1.logger.info(`[DynamicFee] Price cache invalidated`);
    }
    async fetchUniswapPrice() {
        if (!this.provider || !this.config.poolAddress)
            return this.config.fallbackPriceUsd;
        const stateViewAbi = ["function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"];
        try {
            const contract = new ethers_1.Contract(this.config.poolAddress, stateViewAbi, this.provider);
            const poolId = ethers_1.ethers.keccak256(ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["address"], [this.config.poolAddress]));
            const [sqrtPriceX96] = await contract.getSlot0(poolId);
            // B1-7: Unified Uniswap price scaling
            const priceScaled = (BigInt(sqrtPriceX96) * BigInt(sqrtPriceX96) * 1000000n) >> 192n;
            return priceScaled;
        }
        catch (error) {
            logger_1.logger.warn(`[DynamicFee] Uniswap price fetch failed, using fallback: ${error instanceof Error ? error.message : error}`);
            return this.config.fallbackPriceUsd;
        }
    }
    async fetchChainlinkPrice() {
        if (!this.provider || !this.config.chainlinkFeed)
            return this.config.fallbackPriceUsd;
        const feedAbi = ["function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"];
        const MAX_PRICE = 10n ** 12n; // B1-8: Max price 10^12n
        try {
            const contract = new ethers_1.Contract(this.config.chainlinkFeed, feedAbi, this.provider);
            const [, answer, , updatedAt] = await contract.latestRoundData();
            // B1-8: Check updatedAt (within 1 hour) and price <= MAX_PRICE
            const now = BigInt(Math.floor(Date.now() / 1000));
            // P2-4: Tightened staleness check from 3600s to 1800s (30 min)
            if (now - BigInt(updatedAt) > 1800n) {
                throw new Error("Chainlink price stale (>30min)");
            }
            const price = BigInt(answer) / 100n; // 8 decimals -> 6 decimals
            if (price > MAX_PRICE) {
                throw new Error("Chainlink price exceeds MAX_PRICE");
            }
            return price;
        }
        catch (error) {
            logger_1.logger.warn(`[DynamicFee] Chainlink price fetch failed, using fallback: ${error instanceof Error ? error.message : error}`);
            return this.config.fallbackPriceUsd;
        }
    }
    getFeeRate(tttPriceUsd) {
        if (tttPriceUsd < exports.FEE_TIERS.BOOTSTRAP.threshold) {
            return { ...exports.FEE_TIERS.BOOTSTRAP, phase: "BOOTSTRAP" };
        }
        else if (tttPriceUsd < exports.FEE_TIERS.GROWTH.threshold) {
            return { ...exports.FEE_TIERS.GROWTH, phase: "GROWTH" };
        }
        else if (tttPriceUsd < exports.FEE_TIERS.MATURE.threshold) {
            return { ...exports.FEE_TIERS.MATURE, phase: "MATURE" };
        }
        else {
            return { ...exports.FEE_TIERS.PREMIUM, phase: "PREMIUM" };
        }
    }
    async calculateMintFee(tier, tickCount = 1, feeToken = "USDC", feeTokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") {
        // B1-4: Throw if tickCount <= 0
        if (tickCount <= 0)
            throw new Error("[DynamicFee] tickCount must be positive");
        if (!exports.TIER_USD_MICRO[tier])
            throw new Error(`[DynamicFee] Invalid tier: ${tier}`);
        const tttPriceUsd = await this.getTTTPriceUsd(); // 6 decimals
        const usdTarget = exports.TIER_USD_MICRO[tier]; // 6 decimals
        const feeRate = this.getFeeRate(tttPriceUsd);
        const totalUsdCost = usdTarget * BigInt(tickCount); // 6 decimals
        // tttAmount = (totalUsdCost / tttPriceUsd) * 1e18
        const tttAmount = (totalUsdCost * (10n ** 18n)) / tttPriceUsd;
        // protocolFeeUsd = totalUsdCost * feeRate / 10000
        const protocolFeeUsd = (totalUsdCost * feeRate.mintFee) / 10000n;
        return {
            tttAmount,
            protocolFeeUsd,
            feeToken,
            feeTokenAddress,
            clientNet: tttAmount,
            tttPriceUsd,
            usdCost: totalUsdCost + protocolFeeUsd,
            feeRateMint: feeRate.mintFee,
            feeRateBurn: feeRate.burnFee,
            tier,
        };
    }
    async calculateBurnFee(tier, tickCount = 1, feeToken = "USDC", feeTokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") {
        // B1-4: Throw if tickCount <= 0
        if (tickCount <= 0)
            throw new Error("[DynamicFee] tickCount must be positive");
        if (!exports.TIER_USD_MICRO[tier])
            throw new Error(`[DynamicFee] Invalid tier: ${tier}`);
        const tttPriceUsd = await this.getTTTPriceUsd();
        const usdTarget = exports.TIER_USD_MICRO[tier];
        const feeRate = this.getFeeRate(tttPriceUsd);
        const totalUsdCost = usdTarget * BigInt(tickCount);
        const tttAmount = (totalUsdCost * (10n ** 18n)) / tttPriceUsd;
        const protocolFeeUsd = (totalUsdCost * feeRate.burnFee) / 10000n;
        return {
            tttAmount,
            protocolFeeUsd,
            feeToken,
            feeTokenAddress,
            clientNet: tttAmount,
            tttPriceUsd,
            usdCost: totalUsdCost + protocolFeeUsd,
            feeRateMint: feeRate.mintFee,
            feeRateBurn: feeRate.burnFee,
            tier,
        };
    }
    async calculateEmergencyMintFee(tier, tickCount = 1) {
        const base = await this.calculateMintFee(tier, tickCount);
        const emergencyFeeUsd = (base.protocolFeeUsd * 150n) / 100n;
        return {
            ...base,
            protocolFeeUsd: emergencyFeeUsd,
            usdCost: (base.usdCost * 150n) / 100n,
        };
    }
}
exports.DynamicFeeEngine = DynamicFeeEngine;

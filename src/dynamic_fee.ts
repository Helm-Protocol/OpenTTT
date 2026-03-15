// sdk/src/dynamic_fee.ts — Dynamic Fee Engine
// Automatically adjusts tick cost based on TTT market price
// DEX operators only set tier; the SDK handles the rest automatically

import { ethers, Contract, JsonRpcProvider } from "ethers";
import { logger } from "./logger";
import { TierType } from "./types";

// Target USD cost per tier (Scale: 1e6)
//
// PRICING (2026-03-14 감사 수정):
//   T2/T3 가격 하향 — 감사 결과 "트랜잭션당 1틱 소비" 구조에서
//   매 틱 판매 가정은 비현실적. 볼륨 기반 수익 구조로 전환.
//   T2: $0.24 → $0.05 (4.8x 하향)
//   T3: $12.00 → $0.10 (120x 하향)
//
// YP discrepancies (code is authoritative in all cases):
//   YP5: TURBO entry threshold — YP says 90%, code uses 95% (more conservative).
//   YP6: BOOTSTRAP mintFee — YP says 3%, code uses 5% (500 basis points).
//   YP7: PoT min confidence — YP says 0.7, code uses 0.5 (auto_mint.ts).
export const TIER_USD_MICRO: Record<string, bigint> = {
  T0_epoch: 1000n,    // $0.001 * 1e6
  T1_block: 10000n,   // $0.01 * 1e6
  T2_slot:  50000n,   // $0.05 * 1e6 — 감사 수정: 볼륨 기반 수익 구조
  T3_micro: 100000n,  // $0.10 * 1e6 — 감사 수정: 트랜잭션당 1틱 소비 기준
};

// Helm protocol fee tiers (Scale: 1e4, e.g., 500 = 5%)
export const FEE_TIERS = {
  BOOTSTRAP: { mintFee: 500n, burnFee: 200n, threshold: 5000n },   // threshold: $0.005 * 1e6
  GROWTH:    { mintFee: 1000n, burnFee: 300n, threshold: 50000n },  // threshold: $0.05 * 1e6
  MATURE:    { mintFee: 1000n, burnFee: 500n, threshold: 500000n }, // threshold: $0.50 * 1e6
  PREMIUM:   { mintFee: 800n, burnFee: 500n, threshold: -1n },      // Infinity replacement
};

export interface FeeCalculation {
  tttAmount: bigint;        // Required TTT amount (per tick, 18 decimals)
  protocolFeeUsd: bigint;   // Helm protocol fee (stablecoin, 6 decimals)
  feeToken: string;         // Fee payment token symbol
  feeTokenAddress: string;  // Fee token contract address
  clientNet: bigint;        // Client net TTT amount
  tttPriceUsd: bigint;      // Current TTT/USD price (6 decimals)
  usdCost: bigint;          // Total cost in USD (6 decimals)
  feeRateMint: bigint;      // Applied mint fee rate (basis points, 10000 = 100%)
  feeRateBurn: bigint;      // Applied burn fee rate (basis points)
  tier: string;             // Applied tier
}

export interface PriceOracleConfig {
  poolAddress?: string;
  chainlinkFeed?: string;
  cacheDurationMs: number;
  fallbackPriceUsd: bigint; // Scale: 1e6
}

export class DynamicFeeEngine {
  private priceCache: { price: bigint; timestamp: number } | null = null;
  private provider: JsonRpcProvider | null = null;
  private rpcUrls: string[] = [];
  private config: PriceOracleConfig;
  private warnedSpotPrice = false;

  // P2-3: Recommended max cache duration for DEX price freshness
  private static readonly RECOMMENDED_MAX_CACHE_MS = 5000;

  constructor(config: PriceOracleConfig) {
    // R3-P0-1: Prevent division by zero in all fee calculations
    if (config.fallbackPriceUsd <= 0n) {
      throw new Error(`[DynamicFee] fallbackPriceUsd must be > 0, got: ${config.fallbackPriceUsd}`);
    }
    this.config = config;
    // P2-3: Warn if cache duration is too long for DEX pricing
    if (config.cacheDurationMs > DynamicFeeEngine.RECOMMENDED_MAX_CACHE_MS) {
      logger.warn(`[DynamicFee] cacheDurationMs=${config.cacheDurationMs}ms exceeds recommended ${DynamicFeeEngine.RECOMMENDED_MAX_CACHE_MS}ms for DEX pricing accuracy`);
    }
  }

  /**
   * Connect to an RPC provider. Accepts a single URL or an array of URLs
   * for multi-RPC fallback. On connection failure, the next URL is tried.
   */
  async connect(rpcUrl: string | string[]): Promise<void> {
    const urls = Array.isArray(rpcUrl) ? rpcUrl : [rpcUrl];
    if (urls.length === 0 || urls.every(u => !u)) {
      throw new Error("[DynamicFee] At least one valid RPC URL is required");
    }
    this.rpcUrls = urls.filter(u => !!u);
    await this.connectToNext();
  }

  /**
   * Iterate through stored RPC URLs and connect to the first one that succeeds.
   * Throws if all URLs fail.
   */
  private async connectToNext(): Promise<void> {
    let lastError: Error | null = null;
    for (const url of this.rpcUrls) {
      try {
        const provider = new JsonRpcProvider(url);
        // Verify connectivity by requesting the network
        await provider.getNetwork();
        this.provider = provider;
        logger.info(`[DynamicFee] Connected to RPC: ${url}`);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`[DynamicFee] RPC connection failed for ${url}: ${lastError.message}`);
      }
    }
    // If all URLs failed, fall back to the first URL without connectivity check
    // so that subsequent calls can still attempt requests
    this.provider = new JsonRpcProvider(this.rpcUrls[0]);
    logger.warn(`[DynamicFee] All RPC URLs failed connectivity check, using first URL as fallback`);
  }

  async getTTTPriceUsd(): Promise<bigint> {
    const now = Date.now();
    if (this.priceCache && (now - this.priceCache.timestamp) < this.config.cacheDurationMs) {
      return this.priceCache.price;
    }

    try {
      let price: bigint;
      // R4-P1-2: Chainlink FIRST (resistant to flash loan), Uniswap spot as fallback only
      if (this.config.chainlinkFeed && this.provider) {
        price = await this.fetchChainlinkPrice();
      } else if (this.config.poolAddress && this.provider) {
        // To suppress this warning, set `chainlinkFeed` in PriceOracleConfig to a
        // Chainlink AggregatorV3 address (e.g. the TTT/USD feed on your target chain).
        // Chainlink TWAP prices are resistant to single-block flash loan manipulation.
        if (!this.warnedSpotPrice) {
          logger.warn("[DynamicFee] Using Uniswap spot price — vulnerable to flash loan manipulation. Configure chainlinkFeed for production.");
          this.warnedSpotPrice = true;
        }
        price = await this.fetchUniswapPrice();
      } else {
        price = this.config.fallbackPriceUsd;
      }

      if (price <= 0n) {
        logger.warn(`[DynamicFee] Invalid price ${price}, using fallback ${this.config.fallbackPriceUsd}`);
        price = this.config.fallbackPriceUsd;
        // R3-P0-1: Double-guard — fallback validated in constructor but belt-and-suspenders
        if (price <= 0n) throw new Error("[DynamicFee] FATAL: fallbackPriceUsd is zero — cannot calculate fees");
      }

      this.priceCache = { price, timestamp: now };
      return price;
    } catch (error) {
      logger.warn(`[DynamicFee] Price fetch failed, using fallback`);
      return this.config.fallbackPriceUsd;
    }
  }

  /**
   * Force-invalidate price cache -- call when immediate price refresh is needed.
   */
  invalidateCache(): void {
    this.priceCache = null;
    logger.info(`[DynamicFee] Price cache invalidated`);
  }

  private async fetchUniswapPrice(): Promise<bigint> {
    if (!this.provider || !this.config.poolAddress) return this.config.fallbackPriceUsd;
    const stateViewAbi = ["function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"];
    try {
      const contract = new Contract(this.config.poolAddress, stateViewAbi, this.provider);
      const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [this.config.poolAddress]));
      const [sqrtPriceX96] = await contract.getSlot0(poolId);
      
      // B1-7: Unified Uniswap price scaling
      const priceScaled = (BigInt(sqrtPriceX96) * BigInt(sqrtPriceX96) * 1000000n) >> 192n;
      return priceScaled;
    } catch (error) {
      logger.warn(`[DynamicFee] Uniswap price fetch failed, using fallback: ${error instanceof Error ? error.message : error}`);
      return this.config.fallbackPriceUsd;
    }
  }

  private async fetchChainlinkPrice(): Promise<bigint> {
    if (!this.provider || !this.config.chainlinkFeed) return this.config.fallbackPriceUsd;
    const feedAbi = ["function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"];
    const MAX_PRICE = 10n ** 12n; // B1-8: Max price 10^12n
    try {
      const contract = new Contract(this.config.chainlinkFeed, feedAbi, this.provider);
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
    } catch (error) {
      logger.warn(`[DynamicFee] Chainlink price fetch failed, using fallback: ${error instanceof Error ? error.message : error}`);
      return this.config.fallbackPriceUsd;
    }
  }

  getFeeRate(tttPriceUsd: bigint): { mintFee: bigint; burnFee: bigint; phase: string } {
    if (tttPriceUsd < FEE_TIERS.BOOTSTRAP.threshold) {
      return { ...FEE_TIERS.BOOTSTRAP, phase: "BOOTSTRAP" };
    } else if (tttPriceUsd < FEE_TIERS.GROWTH.threshold) {
      return { ...FEE_TIERS.GROWTH, phase: "GROWTH" };
    } else if (tttPriceUsd < FEE_TIERS.MATURE.threshold) {
      return { ...FEE_TIERS.MATURE, phase: "MATURE" };
    } else {
      return { ...FEE_TIERS.PREMIUM, phase: "PREMIUM" };
    }
  }

  async calculateMintFee(
    tier: string,
    tickCount: number = 1,
    feeToken: string = "USDC",
    feeTokenAddress: string = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  ): Promise<FeeCalculation> {
    // B1-4: Throw if tickCount <= 0
    if (tickCount <= 0) throw new Error("[DynamicFee] tickCount must be positive");
    if (!TIER_USD_MICRO[tier]) throw new Error(`[DynamicFee] Invalid tier: ${tier}`);
    
    const tttPriceUsd = await this.getTTTPriceUsd(); // 6 decimals
    const usdTarget = TIER_USD_MICRO[tier]; // 6 decimals
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

  async calculateBurnFee(
    tier: string, 
    tickCount: number = 1,
    feeToken: string = "USDC",
    feeTokenAddress: string = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  ): Promise<FeeCalculation> {
    // B1-4: Throw if tickCount <= 0
    if (tickCount <= 0) throw new Error("[DynamicFee] tickCount must be positive");
    if (!TIER_USD_MICRO[tier]) throw new Error(`[DynamicFee] Invalid tier: ${tier}`);

    const tttPriceUsd = await this.getTTTPriceUsd();
    const usdTarget = TIER_USD_MICRO[tier];
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

  async calculateEmergencyMintFee(tier: string, tickCount: number = 1): Promise<FeeCalculation> {
    const base = await this.calculateMintFee(tier, tickCount);
    const emergencyFeeUsd = (base.protocolFeeUsd * 150n) / 100n;
    return {
      ...base,
      protocolFeeUsd: emergencyFeeUsd,
      usdCost: (base.usdCost * 150n) / 100n,
    };
  }
}


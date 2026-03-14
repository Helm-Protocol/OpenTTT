import { Signer } from "ethers";
import { SignerConfig } from "./signer";
import { NetworkConfig } from "./networks";
import { PotSignature } from "./pot_signer";
export type TierType = "T0_epoch" | "T1_block" | "T2_slot" | "T3_micro";
export declare const TierIntervals: Record<TierType, number>;
/**
 * High-level configuration for TTTClient
 */
export interface TTTClientConfig {
    /**
     * Required: Signer configuration (PrivateKey, Turnkey, Privy, KMS)
     */
    signer: SignerConfig;
    /**
     * Optional: Network selection (preset "base", "sepolia" or custom NetworkConfig)
     * Default: "base" (Base Mainnet)
     */
    network?: string | NetworkConfig;
    /**
     * Optional: Tier resolution (T0 to T3)
     * Default: "T1_block"
     */
    tier?: TierType;
    /**
     * Optional: Override RPC URL provided by network default
     */
    rpcUrl?: string;
    /**
     * Optional: Overwrite default NTP/KTSat sources
     * Default: ["nist", "kriss", "google"]
     */
    timeSources?: string[];
    /**
     * Optional: Override contract address for TTT token
     */
    contractAddress?: string;
    /**
     * Optional: Override protocol fee rate (0.01 ~ 0.10)
     * Default: 0.05
     */
    protocolFeeRate?: number;
    /**
     * Optional: Fallback price for TTT tokens in USD (scaled 1e6)
     * Default: 10000n ($0.01)
     */
    fallbackPriceUsd?: bigint;
    /**
     * Optional: Pool address for DEX operations
     */
    poolAddress?: string;
    /**
     * Optional: Recipient for protocol fees
     */
    protocolFeeRecipient?: string;
    /**
     * Optional: Automatically register SIGINT handler for graceful shutdown
     */
    enableGracefulShutdown?: boolean;
}
/**
 * Internal configuration used by engines.
 * Kept for backwards compatibility.
 */
export interface AutoMintConfig {
    chainId: number;
    poolAddress: string;
    rpcUrl: string;
    privateKey?: string;
    signer?: Signer;
    contractAddress: string;
    feeCollectorAddress?: string;
    tier: TierType;
    timeSources: string[];
    protocolFeeRate: number;
    protocolFeeRecipient: string;
    fallbackPriceUsd?: bigint;
}
export interface MintResult {
    tokenId: string;
    grgHash: string;
    timestamp: bigint;
    txHash: string;
    protocolFeePaid: bigint;
    proofOfTime?: ProofOfTime;
}
export interface TimeReading {
    timestamp: bigint;
    uncertainty: number;
    stratum: number;
    source: string;
}
export interface SynthesizedTime {
    timestamp: bigint;
    confidence: number;
    uncertainty: number;
    sources: number;
    stratum: number;
}
export interface PoolKey {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
}
export interface BeforeSwapParams {
    sender: string;
    key: PoolKey;
    params: {
        zeroForOne: boolean;
        amountSpecified: bigint;
        sqrtPriceLimitX96: bigint;
    };
    hookData: string;
}
export interface AfterSwapParams {
    sender: string;
    key: PoolKey;
    params: {
        zeroForOne: boolean;
        amountSpecified: bigint;
        sqrtPriceLimitX96: bigint;
    };
    delta: {
        amount0: bigint;
        amount1: bigint;
    };
    hookData: string;
}
export interface ProofOfTime {
    timestamp: bigint;
    uncertainty: number;
    sources: number;
    stratum: number;
    confidence: number;
    sourceReadings: {
        source: string;
        timestamp: bigint;
        uncertainty: number;
    }[];
    nonce: string;
    expiresAt: bigint;
    issuerSignature?: PotSignature;
}
export type { PotSignature } from "./pot_signer";

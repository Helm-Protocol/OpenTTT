/**
 * Revenue Tier Configuration
 * Reflects the TTT Labs pricing strategy: Free/Sponsor-backed T0 up to Institutional T3.
 */
export declare enum RevenueTier {
    T0_EPOCH = "T0_EPOCH",
    T1_BLOCK = "T1_BLOCK",
    T2_SLOT = "T2_SLOT",
    T3_MICRO = "T3_MICRO"
}
export interface TierConfig {
    tier: RevenueTier;
    name: string;
    interval: string;
    pricePerTick: number;
    currency: string;
    model: string;
    target: string;
    sponsorEligible: boolean;
}
export interface SponsorConfig {
    sponsor: string;
    tier: RevenueTier;
    monthlyBudgetUsd: number;
    startDate: string;
    endDate: string;
}
export declare const REVENUE_TIERS: Record<RevenueTier, TierConfig>;
/**
 * Calculate projected monthly cost based on tier and throughput.
 */
export declare function calculateMonthlyCost(tier: RevenueTier, ticksPerDay: number): number;
/**
 * Determine the appropriate tier based on a usage description.
 */
export declare function getTierForUseCase(useCase: string): RevenueTier;

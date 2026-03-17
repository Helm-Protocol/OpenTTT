"use strict";
/**
 * Revenue Tier Configuration
 * Reflects the TTT Labs pricing strategy: Free/Sponsor-backed T0 up to Institutional T3.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVENUE_TIERS = exports.RevenueTier = void 0;
exports.calculateMonthlyCost = calculateMonthlyCost;
exports.getTierForUseCase = getTierForUseCase;
var RevenueTier;
(function (RevenueTier) {
    RevenueTier["T0_EPOCH"] = "T0_EPOCH";
    RevenueTier["T1_BLOCK"] = "T1_BLOCK";
    RevenueTier["T2_SLOT"] = "T2_SLOT";
    RevenueTier["T3_MICRO"] = "T3_MICRO";
})(RevenueTier || (exports.RevenueTier = RevenueTier = {}));
exports.REVENUE_TIERS = {
    [RevenueTier.T0_EPOCH]: {
        tier: RevenueTier.T0_EPOCH,
        name: "Standard Epoch",
        interval: "6.4 min",
        pricePerTick: 0,
        currency: "USDC",
        model: "sponsor", // Let's Encrypt model: free to user, sponsor-backed
        target: "Standard L1 Swaps / LP Integration",
        sponsorEligible: true
    },
    [RevenueTier.T1_BLOCK]: {
        tier: RevenueTier.T1_BLOCK,
        name: "Fast Block",
        interval: "2 sec",
        pricePerTick: 0.01,
        currency: "USDC",
        model: "sdk_license",
        target: "L2 Sequencer / Standard DeFi",
        sponsorEligible: false
    },
    [RevenueTier.T2_SLOT]: {
        tier: RevenueTier.T2_SLOT,
        name: "High-Frequency Slot",
        interval: "12 sec",
        pricePerTick: 0.05,
        currency: "USDC",
        model: "sdk_license",
        target: "Active Traders / Arbitrage",
        sponsorEligible: false
    },
    [RevenueTier.T3_MICRO]: {
        tier: RevenueTier.T3_MICRO,
        name: "Institutional Micro-Tick",
        interval: "100 ms",
        pricePerTick: 0.10,
        currency: "USDC",
        model: "enterprise",
        target: "Institutional / HFT Pipelines",
        sponsorEligible: false
    }
};
/**
 * Calculate projected monthly cost based on tier and throughput.
 */
function calculateMonthlyCost(tier, ticksPerDay) {
    const config = exports.REVENUE_TIERS[tier];
    if (config.pricePerTick === 0)
        return 0;
    return config.pricePerTick * ticksPerDay * 30;
}
/**
 * Determine the appropriate tier based on a usage description.
 */
function getTierForUseCase(useCase) {
    const lowerCase = useCase.toLowerCase();
    if (lowerCase.includes("institutional") || lowerCase.includes("hft") || lowerCase.includes("micro")) {
        return RevenueTier.T3_MICRO;
    }
    if (lowerCase.includes("arbitrage") || lowerCase.includes("trader") || lowerCase.includes("slot")) {
        return RevenueTier.T2_SLOT;
    }
    if (lowerCase.includes("l2") || lowerCase.includes("block") || lowerCase.includes("sequencer")) {
        return RevenueTier.T1_BLOCK;
    }
    return RevenueTier.T0_EPOCH;
}

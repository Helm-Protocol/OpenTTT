"use strict";
// sdk/src/x402_enforcer.ts — x402 Micropayment Enforcer (Expanded)
// Governs TTT tick consumption and on-chain settlement.
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Enforcer = void 0;
const logger_1 = require("./logger");
const TIER_MAP = {
    0: "T0_epoch",
    1: "T1_block",
    2: "T2_slot",
    3: "T3_micro"
};
class X402Enforcer {
    static async getCost(feeEngine, tier) {
        const tierKey = TIER_MAP[tier] || "T0_epoch";
        const feeCalc = await feeEngine.calculateMintFee(tierKey);
        return feeCalc.tttAmount;
    }
    /**
     * Deducts TTT ticks from the provided balance and determines Adaptive Mode.
     *
     * **Important:** By default, the `balance` parameter is an SDK-local value
     * (tracked in-memory by the caller). It is NOT verified against the on-chain
     * TTT token balance. This is sufficient for hot-path tick accounting where
     * on-chain settlement happens separately via `deductOnChain()`.
     *
     * @param feeEngine - Dynamic fee engine for cost calculation
     * @param swap - Swap details (user, tokens, amount)
     * @param balance - SDK-local TTT balance (not on-chain unless verifyOnChain=true)
     * @param tier - Stratum tier (0-3)
     * @param mode - Current adaptive mode (Turbo/Full)
     * @param verifyOnChain - If true, checks on-chain TTT balance via EVMConnector
     *   before deducting. Requires `connector` and `tokenId`. Default: false.
     * @param connector - EVMConnector instance (required when verifyOnChain=true)
     * @param tokenId - Token ID for on-chain balance lookup (required when verifyOnChain=true)
     */
    static async deductTick(feeEngine, swap, balance, tier, mode, verifyOnChain = false, connector, tokenId) {
        const cost = await this.getCost(feeEngine, tier);
        // Optional on-chain balance verification before deducting
        if (verifyOnChain) {
            if (!connector || tokenId === undefined) {
                throw new Error("[x402] verifyOnChain requires both connector and tokenId parameters");
            }
            const onChainBalance = await connector.getTTTBalance(swap.user, tokenId);
            if (onChainBalance < cost) {
                throw new Error(`[x402] On-chain balance insufficient for user ${swap.user}. Required: ${cost}, On-chain: ${onChainBalance}.`);
            }
        }
        if (balance < cost) {
            throw new Error(`[x402] Insufficient TTT ticks for user ${swap.user}. Required: ${cost}, Have: ${balance}.`);
        }
        const newBalance = balance - cost;
        logger_1.logger.info(`[x402] Deducted ${cost} ticks for swap. User: ${swap.user}, New Balance: ${newBalance}`);
        return {
            success: true,
            remaining: newBalance,
            mode
        };
    }
    /**
     * Executes on-chain TTT burn via EVMConnector.
     */
    static async deductOnChain(connector, feeEngine, swap, grgHash, tier, feeCollector, burnFeeCalc, signature, nonce, deadline) {
        logger_1.logger.info(`[x402] Enforcing on-chain settlement for user ${swap.user}...`);
        const cost = await this.getCost(feeEngine, tier);
        try {
            const receipt = await connector.burnTTT(cost, grgHash, tier);
            // Collect protocol burn fee if feeCollector and required params are provided
            if (feeCollector && burnFeeCalc && signature && nonce !== undefined && deadline !== undefined) {
                try {
                    await feeCollector.collectBurnFee(burnFeeCalc, signature, swap.user, nonce, deadline);
                }
                catch (feeError) {
                    logger_1.logger.error(`[x402] Burn fee collection failed but burn was successful: ${feeError instanceof Error ? feeError.message : feeError}`);
                }
            }
            return receipt.hash;
        }
        catch (error) {
            logger_1.logger.error(`[x402] On-chain enforcement failed: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }
    /**
     * Static validation rule.
     */
    static async enforcePool(feeEngine, swap, tttBalance, tier) {
        const cost = await this.getCost(feeEngine, tier);
        return tttBalance >= cost;
    }
}
exports.X402Enforcer = X402Enforcer;

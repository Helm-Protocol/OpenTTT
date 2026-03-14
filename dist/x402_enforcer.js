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
     * Deducts TTT ticks from local balance and determines Adaptive Mode.
     */
    static async deductTick(feeEngine, swap, balance, tier, mode) {
        const cost = await this.getCost(feeEngine, tier);
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

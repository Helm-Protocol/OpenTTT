"use strict";
// sdk/src/ttt_builder.ts — TTT Builder Implementation
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTTBuilder = void 0;
const ethers_1 = require("ethers");
const adaptive_switch_1 = require("./adaptive_switch");
const evm_connector_1 = require("./evm_connector");
const dynamic_fee_1 = require("./dynamic_fee");
const logger_1 = require("./logger");
class TTTBuilder {
    mode = adaptive_switch_1.AdaptiveMode.FULL;
    connector;
    tttBalance = 0n;
    adaptiveSwitch;
    constructor(connector) {
        this.connector = connector || new evm_connector_1.EVMConnector();
        this.adaptiveSwitch = new adaptive_switch_1.AdaptiveSwitch();
    }
    /**
     * Purchase TTT from the market using EVMConnector.
     * P1-5: Router/token addresses configurable. P1-6: 5% slippage protection.
     */
    async purchaseTTT(poolAddress, amount, tokenInAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", routerAddress = "0x11C9e42994625A0F52906852A9b91e1B69B79B22", slippageBps = 500n // 5% default slippage protection
    ) {
        logger_1.logger.info(`[TTTBuilder] Purchasing ${amount} TTT from pool: ${poolAddress}`);
        // P1-6: Calculate minimum output with slippage protection
        const minAmountOut = (amount * (10000n - slippageBps)) / 10000n;
        const receipt = await this.connector.swap(routerAddress, tokenInAddress, poolAddress, amount, minAmountOut);
        this.tttBalance += amount;
        logger_1.logger.info(`[TTTBuilder] Purchase successful. TX: ${receipt.hash}. Current balance: ${this.tttBalance}`);
    }
    /**
     * Apply TTT to a block by burning it.
     * This signals the intention to use TTT for prioritized processing.
     */
    async consumeTick(tokenId, tier = "T1_block") {
        logger_1.logger.info(`[TTTBuilder] Consuming TTT tick for token: ${tokenId} (Tier: ${tier})`);
        // Look up tier-based costs from TIER_USD_MICRO
        // Use BigInt to avoid floating point precision issues (Scale: 1e18)
        const usdCostFactor = dynamic_fee_1.TIER_USD_MICRO[tier] || 10000n; // default 0.01 USD
        let costTTT = (usdCostFactor * (10n ** 12n)); // Convert to 18 decimals (1e6 * 1e12 = 1e18)
        // Apply discount if in TURBO mode (Economic incentive for honest builders)
        // R2-P2-3: Use integer-only discount map to avoid float→BigInt precision loss
        const DISCOUNT_PERMILLE = { "TURBO": 200n, "FULL": 0n };
        const discountPermille = DISCOUNT_PERMILLE[this.adaptiveSwitch.getCurrentMode()] ?? 0n;
        if (discountPermille > 0n) {
            costTTT = (costTTT * (1000n - discountPermille)) / 1000n;
            logger_1.logger.info(`[TTTBuilder] TURBO discount applied: ${Number(discountPermille) / 10}%. Final cost: ${costTTT}`);
        }
        if (this.tttBalance < costTTT) {
            throw new Error(`[TTTBuilder] Insufficient TTT balance to consume tick. Needed: ${costTTT}, Balance: ${this.tttBalance}`);
        }
        // Call the actual burn function on the TTT contract via the connector.
        const grgHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(tokenId));
        const tierLevel = parseInt(tier.substring(1, 2)) || 1;
        await this.connector.burnTTT(costTTT, grgHash, tierLevel);
        this.tttBalance -= costTTT;
        logger_1.logger.info(`[TTTBuilder] Tick consumed. Cost: ${costTTT}. Remaining balance: ${this.tttBalance}`);
    }
    /**
     * Verify block data using the AdaptiveSwitch pipeline.
     * Updates the current mode based on verification results.
     */
    async verifyBlock(blockData, tttRecord, chainId, poolAddress, tier) {
        logger_1.logger.info(`[TTTBuilder] Verifying block at timestamp: ${blockData.timestamp}`);
        const result = this.adaptiveSwitch.verifyBlock(blockData, tttRecord, chainId, poolAddress, tier);
        this.mode = result;
        logger_1.logger.info(`[TTTBuilder] Verification complete. Mode: ${this.mode}`);
        return this.mode;
    }
    /**
     * Return the current TURBO/FULL mode.
     */
    getMode() {
        return this.mode;
    }
    /**
     * Helper to get current balance (for testing).
     */
    getBalance() {
        return this.tttBalance;
    }
}
exports.TTTBuilder = TTTBuilder;

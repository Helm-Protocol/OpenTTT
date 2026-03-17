"use strict";
// sdk/src/adaptive_switch.ts — Adaptive Mode Switcher
// Turbo (50ms) vs Full (127ms)
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveSwitch = exports.TIER_TOLERANCE_MS = exports.AdaptiveMode = void 0;
const helm_crypto_1 = require("../vendor/helm-crypto");
const logger_1 = require("./logger");
var AdaptiveMode;
(function (AdaptiveMode) {
    AdaptiveMode["TURBO"] = "TURBO";
    AdaptiveMode["FULL"] = "FULL";
})(AdaptiveMode || (exports.AdaptiveMode = AdaptiveMode = {}));
// const TOLERANCE = 100; // 100ms tolerance for KTSat sync (now configurable via constructor)
/** Tier-based dynamic tolerance (ms) — auditor-requested upgrade */
exports.TIER_TOLERANCE_MS = {
    T0_epoch: 2000, // 6.4min tick → 2s tolerance
    T1_block: 200, // 2s tick → 200ms
    T2_slot: 500, // 12s tick → 500ms
    T3_micro: 10, // 100ms tick → 10ms (10%)
};
class AdaptiveSwitch {
    windowSize = 20; // B1-9: Updated from 10 to 20
    threshold = 0.9; // B1-9: Updated from 0.8 to 0.9
    history = [];
    currentMode = AdaptiveMode.FULL;
    minBlocks = 20; // B1-9: Minimum blocks for TURBO transition
    penaltyCooldown = 0; // B1-9: Penalty cooldown (P2-1: increased to 20 + exponential backoff)
    consecutiveFailures = 0; // P2-1: Track consecutive failures for exponential backoff
    turboEntryThreshold = 0.95; // P2-2: Hysteresis — stricter entry
    turboMaintainThreshold = 0.85; // P2-2: Hysteresis — relaxed maintenance
    tolerance;
    constructor(options) {
        this.tolerance = options?.tolerance ?? 100;
    }
    /**
     * Core TTT mechanism: switches between Turbo/Full mode based on timestamp ordering match rate.
     */
    verifyBlock(block, tttRecord, chainId, poolAddress, tier) {
        // 1. Check timestamp ordering and time match
        const orderMatch = this.compareTransactionOrder(block.txs, tttRecord.txOrder);
        const tolerance = tier ? (exports.TIER_TOLERANCE_MS[tier] ?? this.tolerance) : this.tolerance;
        const timeMatch = Math.abs(block.timestamp - tttRecord.time) < tolerance;
        let sequenceOk = orderMatch && timeMatch;
        // B1-1: Do not skip GrgInverse.verify() in TURBO mode
        // We check integrity regardless of mode
        const integrityOk = helm_crypto_1.GrgInverse.verify(block.data, tttRecord.grgPayload, chainId, poolAddress);
        if (!integrityOk) {
            logger_1.logger.error(`[AdaptiveSwitch] GRG integrity check FAILED`);
            sequenceOk = false; // Mark as false if integrity fails
            if (this.currentMode === AdaptiveMode.TURBO) {
                logger_1.logger.warn(`[AdaptiveSwitch] TURBO integrity failure: Penalty cooldown applied`);
                // P2-1: Exponential backoff — 20 * 2^(consecutiveFailures), capped at 320
                this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 4);
                this.penaltyCooldown = 20 * Math.pow(2, this.consecutiveFailures - 1); // 20, 40, 80, 160, 320
            }
        }
        // 2. Update history (Sliding Window)
        this.history.push(sequenceOk);
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }
        if (this.penaltyCooldown > 0) {
            this.penaltyCooldown--;
        }
        // 3. Calculate match rate and switch mode
        const matchCount = this.history.filter(h => h).length;
        const matchRate = this.history.length > 0 ? matchCount / this.history.length : 0;
        // P2-2: Hysteresis — different thresholds for entering vs maintaining TURBO
        const effectiveThreshold = this.currentMode === AdaptiveMode.TURBO
            ? this.turboMaintainThreshold // 85% to stay in TURBO
            : this.turboEntryThreshold; // 95% to enter TURBO
        if (this.history.length >= this.minBlocks && matchRate >= effectiveThreshold && this.penaltyCooldown === 0) {
            if (this.currentMode === AdaptiveMode.FULL) {
                logger_1.logger.info(`[AdaptiveSwitch] Switching to TURBO mode (Match rate: ${(matchRate * 100).toFixed(1)}%, Entry threshold: ${(this.turboEntryThreshold * 100).toFixed(0)}%)`);
            }
            this.currentMode = AdaptiveMode.TURBO;
            this.consecutiveFailures = 0; // P2-1: Reset on successful TURBO
        }
        else {
            if (this.currentMode === AdaptiveMode.TURBO) {
                logger_1.logger.warn(`[AdaptiveSwitch] Switching to FULL mode (Match rate: ${(matchRate * 100).toFixed(1)}%, Maintain threshold: ${(this.turboMaintainThreshold * 100).toFixed(0)}%, Cooldown: ${this.penaltyCooldown})`);
            }
            this.currentMode = AdaptiveMode.FULL;
        }
        return this.currentMode;
    }
    /**
     * Return fee discount rate based on current mode.
     * TURBO: 20% discount (incentivizes profitability).
     * FULL: No discount.
     */
    getFeeDiscount() {
        return this.currentMode === AdaptiveMode.TURBO ? 0.2 : 0.0;
    }
    /**
     * Get current adaptive mode.
     */
    getCurrentMode() {
        return this.currentMode;
    }
    /**
     * Reset history (for testing).
     */
    reset() {
        this.history = [];
        this.currentMode = AdaptiveMode.FULL;
        this.penaltyCooldown = 0;
        this.consecutiveFailures = 0;
    }
    /**
     * Serialize internal state to JSON for persistence across restarts.
     * Allows operators to avoid re-learning over 20 blocks after a restart.
     */
    serialize() {
        return JSON.stringify({
            history: this.history,
            currentMode: this.currentMode,
            consecutiveFailures: this.consecutiveFailures,
            penaltyCooldown: this.penaltyCooldown,
            tolerance: this.tolerance,
        });
    }
    /**
     * Reconstruct an AdaptiveSwitch from previously serialized JSON state.
     */
    static deserialize(json) {
        const data = JSON.parse(json);
        const instance = new AdaptiveSwitch({ tolerance: data.tolerance ?? 100 });
        instance.history = data.history;
        instance.currentMode = data.currentMode;
        instance.consecutiveFailures = data.consecutiveFailures;
        instance.penaltyCooldown = data.penaltyCooldown;
        return instance;
    }
    compareTransactionOrder(blockTxs, expectedOrder) {
        if (blockTxs.length !== expectedOrder.length)
            return false;
        for (let i = 0; i < blockTxs.length; i++) {
            if (blockTxs[i] !== expectedOrder[i])
                return false;
        }
        return true;
    }
}
exports.AdaptiveSwitch = AdaptiveSwitch;

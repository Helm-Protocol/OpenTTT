"use strict";
// sdk/src/adaptive_switch.ts — Adaptive Mode Switcher
// Turbo (50ms) vs Full (127ms)
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveSwitch = exports.AdaptiveMode = void 0;
const grg_inverse_1 = require("./grg_inverse");
const logger_1 = require("./logger");
var AdaptiveMode;
(function (AdaptiveMode) {
    AdaptiveMode["TURBO"] = "TURBO";
    AdaptiveMode["FULL"] = "FULL";
})(AdaptiveMode || (exports.AdaptiveMode = AdaptiveMode = {}));
const TOLERANCE = 100; // 100ms tolerance for GEO-Sat operator sync
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
    /**
     * TTT의 핵심 메커니즘: 타임스탬프 순서 일치율에 따른 Turbo/Full 모드 전환
     */
    verifyBlock(block, tttRecord) {
        // 1. 타임스탬프 순서 및 시간 일치 여부 확인
        const orderMatch = this.compareTransactionOrder(block.txs, tttRecord.txOrder);
        const timeMatch = Math.abs(block.timestamp - tttRecord.time) < TOLERANCE;
        let sequenceOk = orderMatch && timeMatch;
        // B1-1: Do not skip GrgInverse.verify() in TURBO mode
        // We check integrity regardless of mode
        const integrityOk = grg_inverse_1.GrgInverse.verify(block.data, tttRecord.grgPayload);
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
        // 2. 이력 업데이트 (Sliding Window)
        this.history.push(sequenceOk);
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }
        if (this.penaltyCooldown > 0) {
            this.penaltyCooldown--;
        }
        // 3. 일치율 계산 및 모드 전환
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
     * 모드에 따른 수수료 할인율 반환
     * TURBO: 20% 할인 (수익 증가 유도)
     * FULL: 할인 없음
     */
    getFeeDiscount() {
        return this.currentMode === AdaptiveMode.TURBO ? 0.2 : 0.0;
    }
    /**
     * 현재 모드 조회
     */
    getCurrentMode() {
        return this.currentMode;
    }
    /**
     * 테스트용: 이력 초기화
     */
    reset() {
        this.history = [];
        this.currentMode = AdaptiveMode.FULL;
        this.penaltyCooldown = 0;
        this.consecutiveFailures = 0;
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

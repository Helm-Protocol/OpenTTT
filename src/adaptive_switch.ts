// sdk/src/adaptive_switch.ts — Adaptive Mode Switcher
// Turbo (50ms) vs Full (127ms)

import { GrgInverse } from "./grg_inverse";
import { logger } from "./logger";

export enum AdaptiveMode {
  TURBO = "TURBO", // 50ms — Valid sequence, low latency
  FULL  = "FULL",  // 127ms — Tampered sequence or high G-Score
}

export interface TTTRecord {
  time: number;
  txOrder: string[]; // Hash of transaction order
  grgPayload: Uint8Array[];
}

export interface Block {
  timestamp: number;
  txs: string[];
  data: Uint8Array;
}

const TOLERANCE = 100; // 100ms tolerance for KTSat sync

export class AdaptiveSwitch {
  private windowSize = 20; // B1-9: Updated from 10 to 20
  private threshold = 0.9;  // B1-9: Updated from 0.8 to 0.9
  private history: boolean[] = [];
  private currentMode: AdaptiveMode = AdaptiveMode.FULL;
  private minBlocks = 20; // B1-9: Minimum blocks for TURBO transition
  private penaltyCooldown = 0; // B1-9: Penalty cooldown (P2-1: increased to 20 + exponential backoff)
  private consecutiveFailures = 0; // P2-1: Track consecutive failures for exponential backoff
  private turboEntryThreshold = 0.95; // P2-2: Hysteresis — stricter entry
  private turboMaintainThreshold = 0.85; // P2-2: Hysteresis — relaxed maintenance

  /**
   * Core TTT mechanism: switches between Turbo/Full mode based on timestamp ordering match rate.
   */
  verifyBlock(block: Block, tttRecord: TTTRecord): AdaptiveMode {
    // 1. Check timestamp ordering and time match
    const orderMatch = this.compareTransactionOrder(block.txs, tttRecord.txOrder);
    const timeMatch = Math.abs(block.timestamp - tttRecord.time) < TOLERANCE;
    let sequenceOk = orderMatch && timeMatch;

    // B1-1: Do not skip GrgInverse.verify() in TURBO mode
    // We check integrity regardless of mode
    const integrityOk = GrgInverse.verify(block.data, tttRecord.grgPayload);
    if (!integrityOk) {
      logger.error(`[AdaptiveSwitch] GRG integrity check FAILED`);
      sequenceOk = false; // Mark as false if integrity fails
      if (this.currentMode === AdaptiveMode.TURBO) {
        logger.warn(`[AdaptiveSwitch] TURBO integrity failure: Penalty cooldown applied`);
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
      ? this.turboMaintainThreshold  // 85% to stay in TURBO
      : this.turboEntryThreshold;     // 95% to enter TURBO

    if (this.history.length >= this.minBlocks && matchRate >= effectiveThreshold && this.penaltyCooldown === 0) {
      if (this.currentMode === AdaptiveMode.FULL) {
        logger.info(`[AdaptiveSwitch] Switching to TURBO mode (Match rate: ${(matchRate * 100).toFixed(1)}%, Entry threshold: ${(this.turboEntryThreshold * 100).toFixed(0)}%)`);
      }
      this.currentMode = AdaptiveMode.TURBO;
      this.consecutiveFailures = 0; // P2-1: Reset on successful TURBO
    } else {
      if (this.currentMode === AdaptiveMode.TURBO) {
        logger.warn(`[AdaptiveSwitch] Switching to FULL mode (Match rate: ${(matchRate * 100).toFixed(1)}%, Maintain threshold: ${(this.turboMaintainThreshold * 100).toFixed(0)}%, Cooldown: ${this.penaltyCooldown})`);
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
  getFeeDiscount(): number {
    return this.currentMode === AdaptiveMode.TURBO ? 0.2 : 0.0;
  }

  /**
   * Get current adaptive mode.
   */
  getCurrentMode(): AdaptiveMode {
    return this.currentMode;
  }

  /**
   * Reset history (for testing).
   */
  reset(): void {
    this.history = [];
    this.currentMode = AdaptiveMode.FULL;
    this.penaltyCooldown = 0;
    this.consecutiveFailures = 0;
  }

  private compareTransactionOrder(blockTxs: string[], expectedOrder: string[]): boolean {
    if (blockTxs.length !== expectedOrder.length) return false;
    for (let i = 0; i < blockTxs.length; i++) {
      if (blockTxs[i] !== expectedOrder[i]) return false;
    }
    return true;
  }
}

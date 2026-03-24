// sdk/src/adaptive_switch.ts — Adaptive Mode Switcher (public SDK stub)
// GRG integrity check runs server-side (helm private repo).
// This module exports types, enums, and the client-side AdaptiveSwitch
// (timestamp + ordering check only; integrity check delegated to server).

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

/** Tier-based dynamic tolerance (ms) */
export const TIER_TOLERANCE_MS: Record<string, number> = {
  T0_epoch: 2000,
  T1_block:  200,
  T2_slot:   500,
  T3_micro:   10,
};

export class AdaptiveSwitch {
  private windowSize = 20;
  private turboEntryThreshold = 0.95;
  private turboMaintainThreshold = 0.85;
  private history: boolean[] = [];
  private currentMode: AdaptiveMode = AdaptiveMode.FULL;
  private minBlocks = 20;
  private penaltyCooldown = 0;
  private consecutiveFailures = 0;
  private tolerance: number;

  constructor(options?: { tolerance?: number }) {
    this.tolerance = options?.tolerance ?? 100;
  }

  /**
   * Client-side TTT check: timestamp ordering + time delta only.
   * GRG integrity verification is delegated to the server (IntegrityClient).
   */
  verifyBlock(block: Block, tttRecord: TTTRecord, _chainId: number, _poolAddress: string, tier?: string): AdaptiveMode {
    const orderMatch = this.compareTransactionOrder(block.txs, tttRecord.txOrder);
    const tolerance = tier ? (TIER_TOLERANCE_MS[tier] ?? this.tolerance) : this.tolerance;
    const timeMatch = Math.abs(block.timestamp - tttRecord.time) < tolerance;
    const sequenceOk = orderMatch && timeMatch;

    this.history.push(sequenceOk);
    if (this.history.length > this.windowSize) this.history.shift();
    if (this.penaltyCooldown > 0) this.penaltyCooldown--;

    const matchCount = this.history.filter(h => h).length;
    const matchRate = this.history.length > 0 ? matchCount / this.history.length : 0;
    const effectiveThreshold = this.currentMode === AdaptiveMode.TURBO
      ? this.turboMaintainThreshold
      : this.turboEntryThreshold;

    if (this.history.length >= this.minBlocks && matchRate >= effectiveThreshold && this.penaltyCooldown === 0) {
      if (this.currentMode === AdaptiveMode.FULL) {
        logger.info(`[AdaptiveSwitch] Switching to TURBO (rate: ${(matchRate * 100).toFixed(1)}%)`);
      }
      this.currentMode = AdaptiveMode.TURBO;
      this.consecutiveFailures = 0;
    } else {
      if (this.currentMode === AdaptiveMode.TURBO) {
        logger.warn(`[AdaptiveSwitch] Switching to FULL (rate: ${(matchRate * 100).toFixed(1)}%)`);
      }
      this.currentMode = AdaptiveMode.FULL;
    }
    return this.currentMode;
  }

  getFeeDiscount(): number {
    return this.currentMode === AdaptiveMode.TURBO ? 0.2 : 0.0;
  }

  getCurrentMode(): AdaptiveMode {
    return this.currentMode;
  }

  reset(): void {
    this.history = [];
    this.currentMode = AdaptiveMode.FULL;
    this.penaltyCooldown = 0;
    this.consecutiveFailures = 0;
  }

  serialize(): string {
    return JSON.stringify({
      history: this.history,
      currentMode: this.currentMode,
      consecutiveFailures: this.consecutiveFailures,
      penaltyCooldown: this.penaltyCooldown,
      tolerance: this.tolerance,
    });
  }

  static deserialize(json: string): AdaptiveSwitch {
    const data = JSON.parse(json);
    const instance = new AdaptiveSwitch({ tolerance: data.tolerance ?? 100 });
    instance.history = data.history;
    instance.currentMode = data.currentMode;
    instance.consecutiveFailures = data.consecutiveFailures;
    instance.penaltyCooldown = data.penaltyCooldown;
    return instance;
  }

  private compareTransactionOrder(blockTxs: string[], expectedOrder: string[]): boolean {
    if (blockTxs.length !== expectedOrder.length) return false;
    for (let i = 0; i < blockTxs.length; i++) {
      if (blockTxs[i] !== expectedOrder[i]) return false;
    }
    return true;
  }
}

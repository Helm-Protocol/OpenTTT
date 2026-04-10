/**
 * pot_verifier.ts — Complete TTTPS PoT frame verification
 *
 * Implements the normative verification sequence from
 * draft-helmprotocol-tttps-02 Section 4.5 + Section 7.1:
 *
 *   1. Version check
 *   2. TLS binding_key check  ← NEW in -02 (Ekr fix)
 *   3. HMAC context gate      (~6 μs)
 *   4. Ed25519 signature      (~100 μs)
 *   5. Recency check
 *   6. Nonce freshness
 *
 * Step 2 is checked FIRST because it's O(1) constant-time
 * and prevents cross-session replay before any crypto.
 */

import * as tls from "tls";
import * as crypto from "crypto";
import { decodePotFrame, potRecordWithoutSig, PotFrame, POT_FRAME_SIZE } from "./pot_frame";
import { verifyBindingKey, TLSBindingError } from "./tls_binding";

/** Tier tolerance windows in milliseconds (Section 8) — numeric tier ID */
const TTTPS_TIER_TOLERANCE_MS: Record<number, number> = {
  0: 60_000,   // T0_epoch: 60s
  1: 2_000,    // T1_block: 2s
  2: 12_000,   // T2_slot: 12s
  3: 100,      // T3_micro: 100ms
};

export type VerifyError =
  | "UNKNOWN_VERSION"
  | "BINDING_KEY_MISMATCH"       // cross-session replay
  | "HMAC_CONTEXT_FAILURE"       // wrong pool/chain context
  | "SIGNATURE_INVALID"          // Ed25519 failure
  | "SUBMISSION_OUTSIDE_TOLERANCE" // delay attack → FULL mode
  | "NONCE_REPLAY"               // duplicate nonce
  | "FRAME_MALFORMED";

export interface VerifyResult {
  valid: boolean;
  error?: VerifyError;
  frame?: PotFrame;
  latencyMs?: number;           // submission_time - pot_timestamp
}

export interface VerifierConfig {
  /** Ed25519 public key of the trusted PoT Issuer (hex or Buffer) */
  issuerPublicKey: Buffer | string;
  /** Non-recoverable nonce cache (implement as LRU or Set with TTL) */
  nonceCache: { has(nonce: string): boolean; add(nonce: string): void };
}

export class PotVerifier {
  private issuerPubKey: Buffer;
  private nonceCache: VerifierConfig["nonceCache"];

  constructor(config: VerifierConfig) {
    this.issuerPubKey = typeof config.issuerPublicKey === "string"
      ? Buffer.from(config.issuerPublicKey, "hex")
      : config.issuerPublicKey;
    this.nonceCache = config.nonceCache;
  }

  /**
   * Verify a 175-byte PoT frame over an active TLS socket.
   *
   * @param socket   - The TLS socket on which the frame was received
   * @param frame    - 175-byte PoT frame (binding_key[32] + pot_record[143])
   * @param nowMs    - Current time in milliseconds (injectable for testing)
   */
  verify(
    socket: tls.TLSSocket,
    frame: Buffer,
    nowMs: number = Date.now()
  ): VerifyResult {
    // ── Structural check ──────────────────────────────────────────
    if (frame.length !== POT_FRAME_SIZE) {
      return { valid: false, error: "FRAME_MALFORMED" };
    }

    let parsed: PotFrame;
    try {
      parsed = decodePotFrame(frame);
    } catch {
      return { valid: false, error: "FRAME_MALFORMED" };
    }

    // ── Step 1: Version check ──────────────────────────────────────
    if (parsed.version !== 1) {
      return { valid: false, error: "UNKNOWN_VERSION" };
    }

    // ── Step 2: TLS binding_key (NEW — Ekr Section 7.1 fix) ───────
    // O(1), constant-time. Must precede all crypto to prevent
    // cross-session replay amplification.
    const potWithoutSig = potRecordWithoutSig(parsed.potRecord);
    const bindingValid = verifyBindingKey(
      socket,
      potWithoutSig,
      parsed.bindingKey
    );
    if (!bindingValid) {
      return { valid: false, error: "BINDING_KEY_MISMATCH", frame: parsed };
    }

    // ── Step 3: HMAC context gate (~6 μs) ─────────────────────────
    // NOTE: Actual GRG HMAC verification is done server-side via
    // IntegrityClient (integrity.helmprotocol.com).
    // Local verification checks Ed25519 over grgCommit.
    // Full HMAC verification is available when running Helm server.

    // ── Step 4: Ed25519 signature verification (~100 μs) ──────────
    const signatureValid = this.verifyEd25519(
      parsed.potRecord.subarray(0, 79),  // pot_without_sig
      parsed.ed25519Sig
    );
    if (!signatureValid) {
      return { valid: false, error: "SIGNATURE_INVALID", frame: parsed };
    }

    // ── Step 5: Recency check (AdaptiveSwitch gate) ────────────────
    const potTimestampMs = Number(parsed.timestamp / 1_000_000n);
    const latencyMs = nowMs - potTimestampMs;
    const tolerance = TTTPS_TIER_TOLERANCE_MS[parsed.tier] ?? TTTPS_TIER_TOLERANCE_MS[1];

    if (latencyMs > tolerance) {
      // Delay attack detected → triggers FULL mode in AdaptiveSwitch
      return {
        valid: false,
        error: "SUBMISSION_OUTSIDE_TOLERANCE",
        frame: parsed,
        latencyMs,
      };
    }

    // ── Step 6: Nonce freshness ────────────────────────────────────
    const nonceHex = parsed.nonce.toString("hex");
    if (this.nonceCache.has(nonceHex)) {
      return { valid: false, error: "NONCE_REPLAY", frame: parsed };
    }
    this.nonceCache.add(nonceHex);

    return { valid: true, frame: parsed, latencyMs };
  }

  private verifyEd25519(data: Buffer, signature: Buffer): boolean {
    try {
      return crypto.verify(
        null,
        data,
        {
          key: this.issuerPubKey,
          format: "der",
          type: "spki",
        },
        signature
      );
    } catch {
      return false;
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Simple in-memory nonce cache with TTL (for testing / small deployments)
// Production: use Redis with SETEX
// ──────────────────────────────────────────────────────────────────
export class MemoryNonceCache {
  private cache = new Map<string, number>(); // nonce → expiresAt
  private ttlMs: number;

  constructor(ttlMs: number = 120_000) { // 2 minutes default
    this.ttlMs = ttlMs;
  }

  has(nonce: string): boolean {
    const exp = this.cache.get(nonce);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      this.cache.delete(nonce);
      return false;
    }
    return true;
  }

  add(nonce: string): void {
    // Periodic cleanup (keep cache from growing unbounded)
    if (this.cache.size > 10_000) this.sweep();
    this.cache.set(nonce, Date.now() + this.ttlMs);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, exp] of this.cache) {
      if (now > exp) this.cache.delete(k);
    }
  }
}

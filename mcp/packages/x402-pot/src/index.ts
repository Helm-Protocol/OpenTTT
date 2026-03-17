/**
 * @helm-protocol/x402-pot
 *
 * Proof-of-Time facilitator for x402 payments.
 * Attaches temporal attestation (PoT) to x402 payment objects,
 * enabling AI agents to prove transaction ordering integrity.
 *
 * Usage:
 *   const facilitator = new X402PotFacilitator();
 *   const payment = await facilitator.createPaymentWithPoT({ ... });
 *   const result = await facilitator.verifyPaymentPoT(payment);
 */

import { HttpOnlyClient, HttpPoT, HttpPoTVerifyResult, HttpOnlyClientOptions } from "openttt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface X402BasePayment {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
}

export interface X402PotPayment extends X402BasePayment {
  extra: {
    pot: {
      /** Synthesized timestamp in Unix nanoseconds (string — JSON-safe bigint). */
      timestamp: string;
      /** Expiry in Unix milliseconds (string — JSON-safe bigint). */
      expiresAt: string;
      /** HMAC-SHA256 integrity tag over canonical fields. */
      hmac: string;
      /** Replay-protection nonce (hex). */
      nonce: string;
      /** Fraction of time sources that responded (0.0–1.0). */
      confidence: number;
      /** Number of sources that responded. */
      sources: number;
      /** Names of individual time sources used. */
      sourceNames: string[];
    };
  };
}

export interface X402PotVerifyResult {
  valid: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Facilitator
// ---------------------------------------------------------------------------

/**
 * X402PotFacilitator
 *
 * Wraps openttt's HttpOnlyClient to attach and verify Proof-of-Time
 * on x402 payment objects. Serialises bigint fields as strings for
 * JSON safety across agent boundaries.
 */
export class X402PotFacilitator {
  private readonly client: HttpOnlyClient;

  constructor(options: HttpOnlyClientOptions = {}) {
    this.client = new HttpOnlyClient(options);
  }

  /**
   * Generate a PoT and attach it to the payment as `extra.pot`.
   * Bigint fields (timestamp, expiresAt) are serialised to strings.
   */
  async createPaymentWithPoT(payment: X402BasePayment): Promise<X402PotPayment> {
    const pot: HttpPoT = await this.client.generatePoT();

    return {
      ...payment,
      extra: {
        pot: {
          timestamp:   pot.timestamp.toString(),
          expiresAt:   pot.expiresAt.toString(),
          hmac:        pot.hmac,
          nonce:       pot.nonce,
          confidence:  pot.confidence,
          sources:     pot.sources,
          sourceNames: pot.sourceReadings.map((r) => r.source),
        },
      },
    };
  }

  /**
   * Verify the PoT embedded in an X402PotPayment.
   * Deserialises string fields back to bigint before verification.
   */
  async verifyPaymentPoT(payment: X402PotPayment): Promise<X402PotVerifyResult> {
    const p = payment.extra?.pot;
    if (!p) {
      return { valid: false, reason: "No PoT found in payment.extra.pot" };
    }

    let timestamp: bigint;
    let expiresAt: bigint;
    try {
      timestamp = BigInt(p.timestamp);
      expiresAt = BigInt(p.expiresAt);
    } catch {
      return { valid: false, reason: "Invalid bigint fields in PoT (timestamp or expiresAt)" };
    }

    // Reconstruct the HttpPoT shape expected by verifyPoT
    const reconstructed: HttpPoT = {
      timestamp,
      expiresAt,
      hmac:        p.hmac,
      nonce:       p.nonce,
      confidence:  p.confidence,
      sources:     p.sources,
      stratum:     2, // HTTPS Date header baseline stratum
      sourceReadings: p.sourceNames.map((name) => ({
        source:      name,
        timestamp,   // individual readings not preserved — use synthesised value
        uncertainty: 500,
        stratum:     2,
      })),
    };

    const result: HttpPoTVerifyResult = this.client.verifyPoT(reconstructed);
    return result;
  }
}

// Re-export core openttt types for consumers who want direct access
export { HttpOnlyClient, HttpOnlyClientOptions } from "openttt";
export type { HttpPoT, HttpPoTVerifyResult } from "openttt";

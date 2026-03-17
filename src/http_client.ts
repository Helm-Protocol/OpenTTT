/**
 * TTTClient.httpOnly() — Zero-friction Proof of Time
 * No ETH, no signer, no on-chain. Just verified time.
 *
 * Usage:
 *   const client = TTTClient.httpOnly();
 *   const pot = await client.generatePoT();
 *   console.log(pot.timestamp, pot.confidence);
 *
 * Time sources: NIST, Apple, Google, Cloudflare HTTPS Date headers.
 * HMAC-SHA256 signature — no ethers.js dependency required.
 */

import * as crypto from "crypto";
import * as https from "https";
import { ProofOfTime } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HttpPoT {
  /** Synthesized timestamp in Unix nanoseconds (bigint). */
  timestamp: bigint;
  /** Fraction of configured sources that responded (0.0–1.0). */
  confidence: number;
  /** Lowest NTP stratum observed across sources (2 for HTTPS Date headers). */
  stratum: number;
  /** Number of sources that successfully responded. */
  sources: number;
  /** Per-source readings used to compute the median. */
  sourceReadings: { source: string; timestamp: bigint; uncertainty: number; stratum?: number }[];
  /** Replay-protection nonce (hex). */
  nonce: string;
  /** Expiry timestamp in Unix milliseconds (bigint). */
  expiresAt: bigint;
  /** HMAC-SHA256 over canonical fields, hex-encoded. */
  hmac: string;
}

export interface HttpPoTVerifyResult {
  valid: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Internal HTTPS head request
// ---------------------------------------------------------------------------

interface RawReading {
  source: string;
  timestamp: bigint; // ns
  uncertainty: number; // ms
  stratum: number;
}

const SOURCES: { name: string; url: string }[] = [
  { name: "nist",       url: "https://time.nist.gov/" },
  { name: "apple",      url: "https://time.apple.com/" },
  { name: "google",     url: "https://time.google.com/" },
  { name: "cloudflare", url: "https://time.cloudflare.com/" },
];

function fetchHttpsDate(name: string, url: string, timeoutMs = 3000): Promise<RawReading> {
  return new Promise((resolve, reject) => {
    const t1 = BigInt(Date.now()) * 1_000_000n;

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`[httpOnly] Timeout: ${name} (${timeoutMs}ms)`));
    }, timeoutMs);

    const req = https.request(url, { method: "HEAD" }, (res) => {
      clearTimeout(timer);
      res.resume(); // drain so socket is freed
      const t4 = BigInt(Date.now()) * 1_000_000n;

      const dateHeader = res.headers["date"];
      if (!dateHeader) {
        reject(new Error(`[httpOnly] No Date header from ${name}`));
        return;
      }

      const parsed = new Date(dateHeader).getTime();
      if (isNaN(parsed)) {
        reject(new Error(`[httpOnly] Invalid Date header from ${name}: ${dateHeader}`));
        return;
      }

      const serverNs = BigInt(parsed) * 1_000_000n;
      const rttNs = t4 - t1;
      // Offset-corrected: server time + half RTT
      const corrected = serverNs + rttNs / 2n;
      const rttMs = Number(rttNs) / 1_000_000;

      resolve({
        source: name,
        timestamp: corrected,
        uncertainty: rttMs / 2 + 500, // 500ms base — HTTP Date has 1s resolution
        stratum: 2,
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`[httpOnly] Request error for ${name}: ${err.message}`));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// HMAC helpers — default sandbox key derived from fixed chain+address strings
// ---------------------------------------------------------------------------

const SANDBOX_HMAC_SECRET =
  "openttt-sandbox:chainId=0:address=0x0000000000000000000000000000000000000000";

function computeHmac(
  timestamp: bigint,
  nonce: string,
  expiresAt: bigint,
  sources: number,
  secret: string = SANDBOX_HMAC_SECRET
): string {
  // Canonical message: deterministic field concatenation
  const msg = `${timestamp.toString()}:${nonce}:${expiresAt.toString()}:${sources}`;
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

// ---------------------------------------------------------------------------
// HttpOnlyClient
// ---------------------------------------------------------------------------

export interface HttpOnlyClientOptions {
  /**
   * Override HMAC secret for non-sandbox usage.
   * Defaults to a fixed sandbox key — sufficient for local verification only.
   */
  hmacSecret?: string;
  /**
   * Per-source request timeout in ms. Default: 3000.
   */
  timeoutMs?: number;
  /**
   * PoT validity window in seconds. Default: 60.
   */
  expirySeconds?: number;
  /**
   * Maximum divergence allowed between sources in nanoseconds.
   * Default: 2_000_000_000n (2 seconds — lenient for HTTPS Date 1s resolution).
   */
  toleranceNs?: bigint;
}

/**
 * HttpOnlyClient — zero-dependency Proof of Time over HTTPS.
 *
 * Fetches time from NIST, Apple, Google, and Cloudflare HTTPS endpoints,
 * computes the median, and returns a PoT with HMAC integrity protection.
 *
 * No ETH, no signer, no on-chain interaction required.
 */
export class HttpOnlyClient {
  private readonly hmacSecret: string;
  private readonly timeoutMs: number;
  private readonly expirySeconds: number;
  private readonly toleranceNs: bigint;
  private readonly usedNonces: Map<string, number> = new Map();
  private readonly NONCE_TTL_MS = 300_000; // 5 min
  private readonly MAX_NONCE_CACHE = 10_000;

  constructor(options: HttpOnlyClientOptions = {}) {
    this.hmacSecret   = options.hmacSecret   ?? SANDBOX_HMAC_SECRET;
    this.timeoutMs    = options.timeoutMs    ?? 3000;
    this.expirySeconds = options.expirySeconds ?? 60;
    this.toleranceNs  = options.toleranceNs  ?? 2_000_000_000n; // 2 s
  }

  /**
   * Fetch time from all four HTTPS sources, compute median, return PoT.
   * Requires at least 1 source to succeed.
   */
  async generatePoT(): Promise<HttpPoT> {
    const results = await Promise.allSettled(
      SOURCES.map((s) => fetchHttpsDate(s.name, s.url, this.timeoutMs))
    );

    const readings: RawReading[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") readings.push(r.value);
    }

    if (readings.length === 0) {
      throw new Error(
        "[httpOnly] All HTTPS time sources failed. Check network connectivity."
      );
    }

    // Sort by timestamp for median selection
    readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    let finalTs: bigint;
    let finalUnc: number;
    let finalStratum: number;

    if (readings.length === 1) {
      finalTs      = readings[0].timestamp;
      finalUnc     = readings[0].uncertainty;
      finalStratum = readings[0].stratum;
    } else if (readings.length === 2) {
      finalTs      = (readings[0].timestamp + readings[1].timestamp) / 2n;
      finalUnc     = (readings[0].uncertainty + readings[1].uncertainty) / 2;
      finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
    } else {
      const mid    = Math.floor(readings.length / 2);
      finalTs      = readings[mid].timestamp;
      finalUnc     = readings[mid].uncertainty;
      finalStratum = readings[mid].stratum;
    }

    const nonce     = crypto.randomBytes(16).toString("hex");
    const expiresAt = BigInt(Date.now()) + BigInt(this.expirySeconds * 1000);
    const sourceReadings = readings.map((r) => ({
      source:      r.source,
      timestamp:   r.timestamp,
      uncertainty: r.uncertainty,
      stratum:     r.stratum,
    }));

    const hmac = computeHmac(finalTs, nonce, expiresAt, readings.length, this.hmacSecret);

    return {
      timestamp:      finalTs,
      confidence:     readings.length / SOURCES.length,
      stratum:        finalStratum,
      sources:        readings.length,
      sourceReadings,
      nonce,
      expiresAt,
      hmac,
    };
  }

  /**
   * Verify an HttpPoT:
   * - HMAC integrity check
   * - Expiry check
   * - Nonce replay protection
   * - Source divergence tolerance check
   *
   * No on-chain interaction. Pure local verification.
   */
  verifyPoT(pot: HttpPoT): HttpPoTVerifyResult {
    // 1. Expiry
    if (BigInt(Date.now()) > pot.expiresAt) {
      return { valid: false, reason: "PoT expired" };
    }

    // 2. HMAC integrity
    const expected = computeHmac(
      pot.timestamp,
      pot.nonce,
      pot.expiresAt,
      pot.sources,
      this.hmacSecret
    );
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(pot.hmac, "hex"))) {
      return { valid: false, reason: "HMAC mismatch — PoT may have been tampered" };
    }

    // 3. Nonce replay (bounded cache + TTL)
    const now = Date.now();
    if (this.usedNonces.size > this.MAX_NONCE_CACHE / 2) {
      for (const [k, ts] of this.usedNonces) {
        if (now - ts > this.NONCE_TTL_MS) this.usedNonces.delete(k);
      }
    }
    if (this.usedNonces.has(pot.nonce)) {
      return { valid: false, reason: "Duplicate nonce — replay detected" };
    }
    if (this.usedNonces.size >= this.MAX_NONCE_CACHE) {
      const oldest = this.usedNonces.keys().next().value;
      if (oldest !== undefined) this.usedNonces.delete(oldest);
    }
    this.usedNonces.set(pot.nonce, now);

    // 4. Source divergence
    for (const reading of pot.sourceReadings) {
      const diff =
        reading.timestamp > pot.timestamp
          ? reading.timestamp - pot.timestamp
          : pot.timestamp - reading.timestamp;
      if (diff > this.toleranceNs) {
        return {
          valid: false,
          reason: `Source ${reading.source} diverges by ${diff}ns (tolerance: ${this.toleranceNs}ns)`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Convert HttpPoT to the standard ProofOfTime shape used by the rest of the SDK.
   * The issuerSignature field is omitted (no on-chain signer in httpOnly mode).
   */
  static toProofOfTime(pot: HttpPoT): ProofOfTime {
    return {
      timestamp:      pot.timestamp,
      uncertainty:    pot.sourceReadings.length > 0
        ? pot.sourceReadings.reduce((sum, r) => sum + r.uncertainty, 0) / pot.sourceReadings.length
        : 500,
      sources:        pot.sources,
      stratum:        pot.stratum,
      confidence:     pot.confidence,
      sourceReadings: pot.sourceReadings,
      nonce:          pot.nonce,
      expiresAt:      pot.expiresAt,
    };
  }
}

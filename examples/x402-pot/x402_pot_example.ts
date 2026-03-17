/**
 * x402 + OpenTTT: Proof-of-Time injection into x402 payment headers
 *
 * x402's `extra` field is Record<string, unknown> — PoT slots in without
 * any protocol changes. The receiver verifies the PoT independently before
 * accepting payment, preventing replay and frontrunning.
 *
 * Flow:
 *   1. Payer generates PoT  (proves *when* the payment was authorized)
 *   2. Payer embeds PoT in x402 `extra` field
 *   3. Receiver verifies PoT (expiry, HMAC, nonce, source divergence)
 *   4. If valid → accept payment; if stale/tampered → reject
 *
 * No ETH, no signer, no on-chain interaction required for the PoT step.
 */

import { HttpOnlyClient, HttpPoT } from "openttt";

// ---------------------------------------------------------------------------
// Shared client — both payer and receiver use the same HMAC secret in prod.
// In sandbox mode the default secret is sufficient for local verification.
// ---------------------------------------------------------------------------

const ttt = new HttpOnlyClient({
  expirySeconds: 60,   // PoT valid for 60 s — enough for one payment round-trip
  timeoutMs: 3000,     // per-source HTTP timeout
});

// ---------------------------------------------------------------------------
// Helper: build x402-style payment object with PoT in `extra`
// ---------------------------------------------------------------------------

interface X402PaymentHeader {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    pot: {
      timestamp: string;       // bigint serialised as decimal string
      hmac: string;
      nonce: string;
      sources: number;
      confidence: number;
      expiresAt: string;       // bigint serialised as decimal string
    };
  };
}

function buildPaymentHeader(pot: HttpPoT, payTo: string): X402PaymentHeader {
  return {
    scheme: "exact",
    network: "base-mainnet",
    maxAmountRequired: "1000000",   // 1 USDC (6 decimals)
    resource: "https://api.example.com/v1/inference",
    description: "AI inference call — PoT-attested payment",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 30,
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    extra: {
      pot: {
        timestamp:  pot.timestamp.toString(),
        hmac:       pot.hmac,
        nonce:      pot.nonce,
        sources:    pot.sources,
        confidence: pot.confidence,
        expiresAt:  pot.expiresAt.toString(),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Receiver: extract and verify PoT from incoming payment header
// ---------------------------------------------------------------------------

function verifyPaymentPoT(header: X402PaymentHeader): boolean {
  const raw = header.extra?.pot;
  if (!raw) {
    console.error("[receiver] No PoT in payment header — rejecting.");
    return false;
  }

  // Reconstruct HttpPoT from serialised fields
  const pot: HttpPoT = {
    timestamp:      BigInt(raw.timestamp),
    hmac:           raw.hmac,
    nonce:          raw.nonce,
    sources:        raw.sources,
    confidence:     raw.confidence,
    expiresAt:      BigInt(raw.expiresAt),
    stratum:        2,           // HTTPS Date headers are always stratum 2
    sourceReadings: [],          // not transmitted — divergence check skipped on receiver
  };

  const result = ttt.verifyPoT(pot);
  if (!result.valid) {
    console.error(`[receiver] PoT invalid: ${result.reason}`);
    return false;
  }

  console.log("[receiver] PoT verified — payment accepted.");
  return true;
}

// ---------------------------------------------------------------------------
// Main demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== x402 + OpenTTT: Proof-of-Time Payment Demo ===\n");

  // --- PAYER SIDE ---
  console.log("[payer] Generating Proof of Time...");
  const pot = await ttt.generatePoT();

  console.log(`[payer] PoT generated:`);
  console.log(`  timestamp  : ${pot.timestamp} ns`);
  console.log(`  confidence : ${(pot.confidence * 100).toFixed(0)}%  (${pot.sources}/4 sources)`);
  console.log(`  stratum    : ${pot.stratum}`);
  console.log(`  nonce      : ${pot.nonce}`);
  console.log(`  expiresAt  : ${new Date(Number(pot.expiresAt)).toISOString()}`);
  console.log();

  const paymentHeader = buildPaymentHeader(
    pot,
    "0x1234567890abcdef1234567890abcdef12345678"  // example payTo address
  );

  console.log("[payer] Payment header (with PoT in extra):");
  console.log(JSON.stringify(paymentHeader, null, 2));
  console.log();

  // --- RECEIVER SIDE ---
  console.log("[receiver] Verifying incoming payment PoT...");
  const accepted = verifyPaymentPoT(paymentHeader);
  console.log(`[receiver] Payment ${accepted ? "ACCEPTED" : "REJECTED"}\n`);

  // --- REPLAY ATTACK DEMO ---
  console.log("[attacker] Attempting replay with the same PoT...");
  const replayAccepted = verifyPaymentPoT(paymentHeader);
  console.log(`[receiver] Replay ${replayAccepted ? "ACCEPTED (bug!)" : "REJECTED — nonce already used"}\n`);

  // --- TAMPER DEMO ---
  console.log("[attacker] Attempting tampered PoT (modified timestamp)...");
  const tampered = structuredClone(paymentHeader);
  tampered.extra.pot.timestamp = (BigInt(tampered.extra.pot.timestamp) + 1_000_000_000n).toString();
  const ttt2 = new HttpOnlyClient(); // fresh client (no nonce cache)
  const tamperedPot: HttpPoT = {
    timestamp:      BigInt(tampered.extra.pot.timestamp),
    hmac:           tampered.extra.pot.hmac,
    nonce:          tampered.extra.pot.nonce,
    sources:        tampered.extra.pot.sources,
    confidence:     tampered.extra.pot.confidence,
    expiresAt:      BigInt(tampered.extra.pot.expiresAt),
    stratum:        2,
    sourceReadings: [],
  };
  const tamperedResult = ttt2.verifyPoT(tamperedPot);
  console.log(`[receiver] Tampered PoT ${tamperedResult.valid ? "ACCEPTED (bug!)" : `REJECTED — ${tamperedResult.reason}`}\n`);

  console.log("=== Demo complete ===");
}

main().catch(console.error);

/**
 * 05-flashbots-protect.ts — "Trust vs Verify" Demo
 *
 * Flashbots Protect gives you a private mempool — builders are ASKED not to
 * sandwich your transaction. That is HTTP-level trust.
 *
 * OpenTTT adds Proof of Time (PoT) — transaction ordering is PROVEN with
 * multi-source time synthesis + Ed25519 signatures. That is HTTPS-level verify.
 *
 * "Flashbots is HTTP. OpenTTT is HTTPS."
 *
 * Phase A: Flashbots Protect only (private mempool, trust-based)
 * Phase B: Flashbots + TTT PoT (trust + physics-based verification)
 *
 * NOTE: This demo will attempt real NTP/HTTPS time source queries for PoT
 * generation. The Flashbots RPC calls are illustrative — they require a real
 * Flashbots-enabled provider to execute on-chain.
 */
import { TimeSynthesis } from '../src/time_synthesis';
import { PotSigner } from '../src/pot_signer';
import { AdaptiveSwitch, AdaptiveMode } from '../src/adaptive_switch';

// ─── Helpers ────────────────────────────────────────────────────────────────

function separator() {
  console.log('─'.repeat(68));
}

function nsToMs(ns: bigint): string {
  return (Number(ns) / 1_000_000).toFixed(2);
}

// ─── Phase A: Flashbots Protect Only ────────────────────────────────────────

async function phaseA() {
  console.log('');
  separator();
  console.log('  PHASE A — Flashbots Protect Only (Trust-Based)');
  separator();
  console.log('');

  // In production you would pass this RPC to ethers.JsonRpcProvider:
  //   const provider = new ethers.JsonRpcProvider("https://rpc.flashbots.net");
  const FLASHBOTS_RPC = 'https://rpc.flashbots.net';

  console.log(`  RPC endpoint : ${FLASHBOTS_RPC}`);
  console.log('  Protection   : Private mempool — tx hidden from public mempool');
  console.log('  Mechanism    : Builders voluntarily skip sandwich opportunities');
  console.log('  Verification : NONE — you trust the builder was honest');
  console.log('');

  // Simulated swap submission (would use ethers in production)
  const simulatedTx = {
    to: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',  // Uniswap Router
    value: '1000000000000000000',                        // 1 ETH
    data: '0x5ae401dc...',                               // swap calldata
  };

  console.log('  Submitting swap via Flashbots Protect...');
  console.log(`    to    : ${simulatedTx.to}`);
  console.log(`    value : ${simulatedTx.value} wei (1 ETH)`);
  console.log('');
  console.log('  Result:');
  console.log('    [OK] Transaction is private — sandwich bots cannot see it');
  console.log('    [??] But was the builder honest about ordering?');
  console.log('    [??] No cryptographic proof. No way to verify after the fact.');
  console.log('');
  console.log('  Phase A asks builders to behave.');
  console.log('');
}

// ─── Phase B: Flashbots + TTT Proof of Time ────────────────────────────────

async function phaseB() {
  separator();
  console.log('  PHASE B — Flashbots + TTT PoT (Trust + Verify)');
  separator();
  console.log('');

  // Same Flashbots RPC for private mempool...
  const FLASHBOTS_RPC = 'https://rpc.flashbots.net';
  console.log(`  RPC endpoint : ${FLASHBOTS_RPC} (same private mempool)`);
  console.log('  + OpenTTT    : Multi-source time synthesis + Ed25519 PoT');
  console.log('');

  // ── Step 1: Synthesize time from multiple independent sources ──

  console.log('  Step 1 — Time Synthesis (multi-source median)');
  const ts = new TimeSynthesis({ sources: ['nist', 'google', 'cloudflare', 'apple'] });

  try {
    const synth = await ts.synthesize();
    console.log(`    Timestamp   : ${synth.timestamp} ns`);
    console.log(`    Sources     : ${synth.sources} responded`);
    console.log(`    Confidence  : ${(synth.confidence * 100).toFixed(0)}%`);
    console.log(`    Uncertainty : ±${synth.uncertainty.toFixed(1)} ms`);
    console.log(`    Stratum     : ${synth.stratum}`);
    console.log('');

    // ── Step 2: Generate Proof of Time ──

    console.log('  Step 2 — Generate Proof of Time (PoT)');
    const pot = await ts.generateProofOfTime();

    console.log(`    PoT timestamp : ${pot.timestamp} ns`);
    console.log(`    Nonce         : ${pot.nonce.slice(0, 16)}...`);
    console.log(`    Expires at    : ${pot.expiresAt} (${nsToMs(pot.expiresAt - BigInt(Date.now()))} ms from now)`);
    console.log(`    Sources used  : ${pot.sourceReadings.map(s => s.source).join(', ')}`);
    console.log('');

    // ── Step 3: Sign PoT with Ed25519 (non-repudiation) ──

    console.log('  Step 3 — Ed25519 Signature (non-repudiation)');
    const signer = new PotSigner();  // ephemeral keypair for demo
    const potHash = TimeSynthesis.getOnChainHash(pot);
    const sig = signer.signPot(potHash);

    console.log(`    Issuer pubkey : ${sig.issuerPubKey.slice(0, 32)}...`);
    console.log(`    Signature     : ${sig.signature.slice(0, 32)}...`);
    console.log(`    Issued at     : ${sig.issuedAt}`);

    // Verify the signature
    const sigValid = PotSigner.verifyPotSignature(potHash, sig);
    console.log(`    Verify        : ${sigValid ? 'PASS' : 'FAIL'}`);
    console.log('');

    // ── Step 4: Self-verify PoT integrity ──

    console.log('  Step 4 — PoT Self-Verification');
    const potValid = ts.verifyProofOfTime(pot);
    console.log(`    Integrity     : ${potValid ? 'PASS — all source readings within tolerance' : 'FAIL'}`);
    console.log('');

    // ── Step 5: Adaptive Mode determination ──

    console.log('  Step 5 — Adaptive Mode (TURBO vs FULL)');
    console.log('    If builder ordering matches PoT ordering:');
    console.log(`      → ${AdaptiveMode.TURBO} mode (50ms) — fast, lower fees, higher profit`);
    console.log('    If builder tampered with ordering:');
    console.log(`      → ${AdaptiveMode.FULL} mode (127ms) — slow, full verification, profit drops`);
    console.log('    Dishonest builders naturally lose revenue. No punishment needed.');
    console.log('');

    // ── Step 6: On-chain hash for smart contract submission ──

    console.log('  Step 6 — On-Chain Hash (for smart contract)');
    console.log(`    keccak256     : ${potHash}`);
    console.log('    This hash is submitted with the swap tx as hookData.');
    console.log('    The Uniswap V4 hook verifies PoT before allowing the swap.');
    console.log('');

    // ── Summary ──

    separator();
    console.log('  COMPARISON');
    separator();
    console.log('');
    console.log('  Phase A (Flashbots only):');
    console.log('    Protection    : Private mempool (hidden from bots)');
    console.log('    Ordering      : Trust-based — "please don\'t reorder"');
    console.log('    Verification  : None');
    console.log('    Analogy       : HTTP — plaintext, hope nobody is listening');
    console.log('');
    console.log('  Phase B (Flashbots + OpenTTT):');
    console.log('    Protection    : Private mempool + cryptographic time proof');
    console.log('    Ordering      : Physics-based — multi-source median timestamp');
    console.log('    Verification  : Ed25519 signed PoT + on-chain hash verification');
    console.log('    Analogy       : HTTPS — encrypted, authenticated, non-repudiable');
    console.log('');
    separator();
    console.log('  Phase A asks builders to behave.');
    console.log('  Phase B proves they did.');
    separator();
    console.log('');

  } catch (err) {
    // Expected in environments without network access to NTP/HTTPS time sources
    console.log(`    [Expected in demo] Time source error: ${err instanceof Error ? err.message : err}`);
    console.log('    In production, ensure HTTPS access to time.nist.gov, time.google.com, etc.');
    console.log('');
  } finally {
    ts.close();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  OpenTTT SDK — Flashbots Protect Integration Demo');
  console.log('  "Flashbots is HTTP. OpenTTT is HTTPS."');

  await phaseA();
  await phaseB();
}

main().catch(console.error);

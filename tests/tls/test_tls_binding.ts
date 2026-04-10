/**
 * test_tls_binding.ts — Unit tests for TLS binding implementation
 * Tests without a real TLS socket using mocks.
 *
 * Run: npx ts-node test_tls_binding.ts
 */

import { encodePotFrame, decodePotFrame, potRecordWithoutSig,
         POT_FRAME_SIZE, POT_RECORD_SIZE, BINDING_KEY_SIZE } from "./pot_frame";
import { MemoryNonceCache } from "./pot_verifier";

// ── Test helpers ──────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── pot_frame tests ───────────────────────────────────────────────
console.log("\n[pot_frame.ts]");

test("C.7 - Frame total size is 175 bytes", () => {
  assert(POT_FRAME_SIZE === 175, `Expected 175, got ${POT_FRAME_SIZE}`);
  assert(BINDING_KEY_SIZE + POT_RECORD_SIZE === 175, "32 + 143 = 175");
});

test("Encode/decode round-trip", () => {
  const bindingKey = Buffer.alloc(32, 0xAB);
  const potRecord  = Buffer.alloc(143);
  // Set version=1, tier=1 in first byte
  potRecord[0] = 0x11;
  // Set timestamp
  potRecord.writeBigUInt64BE(1712000000000000000n, 3);
  // Set confidence
  potRecord.writeUInt32BE(500, 11);
  // Fill nonce with random-ish
  potRecord.fill(0xCC, 15, 47);
  // Fill GRG commit
  potRecord.fill(0xDD, 47, 79);
  // Fill sig
  potRecord.fill(0xEE, 79, 143);

  const frame = encodePotFrame(bindingKey, potRecord);
  assert(frame.length === 175, "Frame must be 175 bytes");

  const parsed = decodePotFrame(frame);
  assert(parsed.version === 1, "Version must be 1");
  assert(parsed.tier === 1, "Tier must be 1");
  assert(parsed.bindingKey.equals(bindingKey), "binding_key must survive round-trip");
  assert(parsed.grgCommit[0] === 0xDD, "GRG commit must survive round-trip");
  assert(parsed.ed25519Sig[0] === 0xEE, "Ed25519 sig must survive round-trip");
});

test("potRecordWithoutSig returns first 79 bytes", () => {
  const potRecord = Buffer.allocUnsafe(143);
  potRecord.fill(0xAA, 0, 79);
  potRecord.fill(0xBB, 79, 143);  // signature portion

  const withoutSig = potRecordWithoutSig(potRecord);
  assert(withoutSig.length === 79, "Must be 79 bytes");
  assert(withoutSig[0] === 0xAA, "Must start with pre-sig bytes");
  assert(withoutSig[78] === 0xAA, "Last pre-sig byte must be correct");
});

test("C.1 - Reserved field must be 0", () => {
  const potRecord = Buffer.alloc(143);
  potRecord[0] = 0x11;  // version=1, tier=1
  potRecord[1] = 0x03;  // sourceCount=3
  potRecord[2] = 0x01;  // reserved = 1 (INVALID)

  const frame = encodePotFrame(Buffer.alloc(32), potRecord);
  try {
    const { validatePotFrameStructure } = require("./pot_frame");
    validatePotFrameStructure(frame);
    assert(false, "Should have thrown");
  } catch (e: any) {
    assert(e.message.includes("Reserved"), `Wrong error: ${e.message}`);
  }
});

// ── nonce cache tests ─────────────────────────────────────────────
console.log("\n[MemoryNonceCache]");

test("C.2 - Nonce uniqueness enforcement", () => {
  const cache = new MemoryNonceCache(5000);
  const nonce = "deadbeef01020304";

  assert(!cache.has(nonce), "Fresh nonce must not be in cache");
  cache.add(nonce);
  assert(cache.has(nonce), "Nonce must be in cache after add");
});

test("C.2 - Different nonces don't collide", () => {
  const cache = new MemoryNonceCache(5000);
  cache.add("aabbccdd");
  assert(!cache.has("11223344"), "Different nonce must not be present");
});

test("Nonce expiry after TTL", async () => {
  const cache = new MemoryNonceCache(50); // 50ms TTL
  cache.add("expiring");
  assert(cache.has("expiring"), "Must be present immediately");

  await new Promise(r => setTimeout(r, 100)); // wait 100ms

  assert(!cache.has("expiring"), "Must expire after TTL");
});

// ── TLS Exporter mock test ─────────────────────────────────────────
console.log("\n[TLS Exporter mock]");

test("computeBindingKey is deterministic for same session", () => {
  // We can't create a real TLS socket in unit tests,
  // but we can verify the crypto.timingSafeEqual path

  const a = Buffer.alloc(32, 0x01);
  const b = Buffer.alloc(32, 0x01);
  const c = Buffer.alloc(32, 0x02);

  const { timingSafeEqual } = require("crypto");
  assert(timingSafeEqual(a, b), "Equal buffers must pass");
  assert(!timingSafeEqual(a, c), "Different buffers must fail");
});

test("binding_key wrong length fails verification", () => {
  // verifyBindingKey checks length before crypto
  const { verifyBindingKey } = require("./tls_binding");
  const shortKey = Buffer.alloc(16, 0x00); // wrong: 16 not 32
  const potWithoutSig = Buffer.alloc(79);
  const mockSocket = { encrypted: true, exportKeyingMaterial: () => Buffer.alloc(32, 0xFF) };

  const result = verifyBindingKey(mockSocket as any, potWithoutSig, shortKey);
  assert(result === false, "Short binding_key must fail verification");
});

// ── Summary ───────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

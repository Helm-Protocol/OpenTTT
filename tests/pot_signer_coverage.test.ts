// tests/pot_signer_coverage.test.ts — Extended coverage for PotSigner
import { PotSigner, PotSignature } from "../src/pot_signer";
import { randomBytes } from "crypto";

describe("PotSigner — Coverage Extension", () => {

  test("Constructor with no args generates a new keypair", () => {
    const signer = new PotSigner();
    expect(signer.getPubKeyHex()).toBeTruthy();
    expect(signer.getPrivateKeyHex()).toBeTruthy();
  });

  test("Constructor with existing privateKeyHex restores same identity", () => {
    const original = new PotSigner();
    const privHex = original.getPrivateKeyHex();
    const restored = new PotSigner(privHex);
    expect(restored.getPubKeyHex()).toBe(original.getPubKeyHex());
    expect(restored.getPrivateKeyHex()).toBe(privHex);
  });

  test("getPubKeyHex() returns a valid hex string (88 chars for Ed25519 SPKI DER)", () => {
    const signer = new PotSigner();
    const hex = signer.getPubKeyHex();
    expect(typeof hex).toBe("string");
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex.length).toBe(88);
  });

  test("getPrivateKeyHex() returns a valid hex string", () => {
    const signer = new PotSigner();
    const hex = signer.getPrivateKeyHex();
    expect(typeof hex).toBe("string");
    expect(hex).toMatch(/^[0-9a-f]+$/);
    // PKCS8 DER for Ed25519 is 48 bytes = 96 hex chars
    expect(hex.length).toBe(96);
  });

  test("signPot() with 0x-prefixed hash produces valid signature", () => {
    const signer = new PotSigner();
    const rawHash = randomBytes(32).toString("hex");
    const sig = signer.signPot("0x" + rawHash);
    expect(sig.issuerPubKey).toBe(signer.getPubKeyHex());
    expect(sig.signature.length).toBeGreaterThan(0);
    expect(sig.issuedAt).toBeGreaterThan(0n);
    // Should verify with either prefix form
    expect(PotSigner.verifyPotSignature("0x" + rawHash, sig)).toBe(true);
    expect(PotSigner.verifyPotSignature(rawHash, sig)).toBe(true);
  });

  test("signPot() without 0x prefix produces valid signature", () => {
    const signer = new PotSigner();
    const rawHash = randomBytes(32).toString("hex");
    const sig = signer.signPot(rawHash);
    expect(sig.issuerPubKey).toBe(signer.getPubKeyHex());
    expect(sig.signature.length).toBeGreaterThan(0);
    expect(PotSigner.verifyPotSignature(rawHash, sig)).toBe(true);
  });

  test("verifyPotSignature() returns true for valid signature", () => {
    const signer = new PotSigner();
    const hash = randomBytes(32).toString("hex");
    const sig = signer.signPot(hash);
    expect(PotSigner.verifyPotSignature(hash, sig)).toBe(true);
  });

  test("verifyPotSignature() returns false for wrong hash", () => {
    const signer = new PotSigner();
    const hash1 = randomBytes(32).toString("hex");
    const hash2 = randomBytes(32).toString("hex");
    const sig = signer.signPot(hash1);
    expect(PotSigner.verifyPotSignature(hash2, sig)).toBe(false);
  });

  test("verifyPotSignature() returns false for wrong expectedPubKey", () => {
    const signer1 = new PotSigner();
    const signer2 = new PotSigner();
    const hash = randomBytes(32).toString("hex");
    const sig = signer1.signPot(hash);
    // Mismatch: sig was issued by signer1, but we expect signer2's key
    expect(PotSigner.verifyPotSignature(hash, sig, signer2.getPubKeyHex())).toBe(false);
  });

  test("verifyPotSignature() returns false for garbage input", () => {
    const garbageSig: PotSignature = {
      issuerPubKey: "not-valid-hex",
      signature: "also-garbage",
      issuedAt: 0n,
    };
    // Should not throw, just return false via the catch block
    expect(PotSigner.verifyPotSignature("deadbeef", garbageSig)).toBe(false);
  });

  test("Round-trip: sign then verify with correct expectedPubKey", () => {
    const signer = new PotSigner();
    const hash = randomBytes(32).toString("hex");
    const sig = signer.signPot(hash);
    expect(PotSigner.verifyPotSignature(hash, sig, signer.getPubKeyHex())).toBe(true);
  });

  test("Two different signers produce different pubkeys", () => {
    const a = new PotSigner();
    const b = new PotSigner();
    expect(a.getPubKeyHex()).not.toBe(b.getPubKeyHex());
  });

  test("signPot() issuedAt is a reasonable unix timestamp", () => {
    const signer = new PotSigner();
    const hash = randomBytes(32).toString("hex");
    const sig = signer.signPot(hash);
    const now = BigInt(Math.floor(Date.now() / 1000));
    // Should be within 5 seconds of now
    expect(sig.issuedAt).toBeGreaterThanOrEqual(now - 5n);
    expect(sig.issuedAt).toBeLessThanOrEqual(now + 5n);
  });
});

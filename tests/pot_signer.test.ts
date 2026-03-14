// sdk/tests/pot_signer.test.ts — Ed25519 PoT Signer Tests
import { PotSigner, PotSignature } from "../src/pot_signer";
import { randomBytes } from "crypto";

describe("PotSigner — Ed25519 Proof of Time Signing", () => {

  test("1. Key generation produces valid hex pubkey", () => {
    const signer = new PotSigner();
    const pubHex = signer.getPubKeyHex();
    expect(pubHex).toBeTruthy();
    expect(pubHex.length).toBeGreaterThan(0);
    // SPKI DER for Ed25519 is 44 bytes = 88 hex chars
    expect(pubHex.length).toBe(88);
  });

  test("2. Key persistence roundtrip (export private -> reimport)", () => {
    const signer1 = new PotSigner();
    const privHex = signer1.getPrivateKeyHex();
    const signer2 = new PotSigner(privHex);
    expect(signer2.getPubKeyHex()).toBe(signer1.getPubKeyHex());
  });

  test("3. Sign + verify roundtrip succeeds", () => {
    const signer = new PotSigner();
    const potHash = randomBytes(32).toString('hex');

    const sig = signer.signPot(potHash);
    expect(sig.issuerPubKey).toBe(signer.getPubKeyHex());
    expect(sig.signature.length).toBeGreaterThan(0);
    expect(sig.issuedAt).toBeGreaterThan(0n);

    const valid = PotSigner.verifyPotSignature(potHash, sig);
    expect(valid).toBe(true);
  });

  test("4. Sign + verify with 0x-prefixed hash", () => {
    const signer = new PotSigner();
    const rawHash = randomBytes(32).toString('hex');
    const prefixedHash = '0x' + rawHash;

    const sig = signer.signPot(prefixedHash);
    // Verify with same prefix
    expect(PotSigner.verifyPotSignature(prefixedHash, sig)).toBe(true);
    // Verify without prefix (same underlying data)
    expect(PotSigner.verifyPotSignature(rawHash, sig)).toBe(true);
  });

  test("5. Tampered hash is rejected", () => {
    const signer = new PotSigner();
    const potHash = randomBytes(32).toString('hex');
    const sig = signer.signPot(potHash);

    // Tamper: flip first byte
    const tampered = (parseInt(potHash.substring(0, 2), 16) ^ 0xff)
      .toString(16).padStart(2, '0') + potHash.substring(2);

    const valid = PotSigner.verifyPotSignature(tampered, sig);
    expect(valid).toBe(false);
  });

  test("6. Wrong public key is rejected", () => {
    const signer1 = new PotSigner();
    const signer2 = new PotSigner();
    const potHash = randomBytes(32).toString('hex');

    const sig = signer1.signPot(potHash);

    // Verify with expectedPubKey = signer2's key (mismatch)
    const valid = PotSigner.verifyPotSignature(potHash, sig, signer2.getPubKeyHex());
    expect(valid).toBe(false);
  });

  test("7. Verify with correct expectedPubKey succeeds", () => {
    const signer = new PotSigner();
    const potHash = randomBytes(32).toString('hex');
    const sig = signer.signPot(potHash);

    const valid = PotSigner.verifyPotSignature(potHash, sig, signer.getPubKeyHex());
    expect(valid).toBe(true);
  });

  test("8. Tampered signature bytes are rejected", () => {
    const signer = new PotSigner();
    const potHash = randomBytes(32).toString('hex');
    const sig = signer.signPot(potHash);

    // Corrupt signature
    const corruptedSig: PotSignature = {
      ...sig,
      signature: sig.signature.substring(0, sig.signature.length - 4) + 'ffff',
    };

    const valid = PotSigner.verifyPotSignature(potHash, corruptedSig);
    expect(valid).toBe(false);
  });
});

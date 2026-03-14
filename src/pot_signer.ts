// sdk/src/pot_signer.ts — Ed25519 signing for Proof of Time (Non-repudiation)
// Uses Node.js built-in crypto.sign/verify with Ed25519
import { createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } from "crypto";

export interface PotSignature {
  issuerPubKey: string;  // hex-encoded Ed25519 public key (SPKI DER)
  signature: string;     // hex-encoded Ed25519 signature over PoT hash
  issuedAt: bigint;      // unix seconds when the signature was created
}

export class PotSigner {
  private privateKey: ReturnType<typeof createPrivateKey>;
  private publicKey: ReturnType<typeof createPublicKey>;
  private pubKeyHex: string;

  constructor(privateKeyHex?: string) {
    if (privateKeyHex) {
      // Import existing key from PKCS8 DER hex
      const keyBuffer = Buffer.from(privateKeyHex, 'hex');
      this.privateKey = createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
      this.publicKey = createPublicKey(this.privateKey);
    } else {
      // Generate new Ed25519 keypair
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.privateKey = privateKey;
      this.publicKey = publicKey;
    }
    this.pubKeyHex = this.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  }

  /** Returns the hex-encoded SPKI DER public key */
  getPubKeyHex(): string {
    return this.pubKeyHex;
  }

  /** Returns the hex-encoded PKCS8 DER private key (for persistence) */
  getPrivateKeyHex(): string {
    return (this.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('hex');
  }

  /**
   * Sign a PoT hash with Ed25519.
   * @param potHash - hex string (with or without 0x prefix) of the PoT hash
   * @returns PotSignature with issuerPubKey, signature, and issuedAt
   */
  signPot(potHash: string): PotSignature {
    const data = Buffer.from(potHash.startsWith('0x') ? potHash.slice(2) : potHash, 'hex');
    const sig = sign(null, data, this.privateKey);
    return {
      issuerPubKey: this.pubKeyHex,
      signature: sig.toString('hex'),
      issuedAt: BigInt(Math.floor(Date.now() / 1000)),
    };
  }

  /**
   * Verify a PotSignature against a PoT hash.
   * @param potHash - hex string (with or without 0x prefix)
   * @param potSig - the PotSignature to verify
   * @param expectedPubKey - optional: reject if issuerPubKey doesn't match
   * @returns true if signature is valid
   */
  static verifyPotSignature(potHash: string, potSig: PotSignature, expectedPubKey?: string): boolean {
    if (expectedPubKey && potSig.issuerPubKey !== expectedPubKey) return false;
    try {
      const data = Buffer.from(potHash.startsWith('0x') ? potHash.slice(2) : potHash, 'hex');
      const sigBuffer = Buffer.from(potSig.signature, 'hex');
      const pubKey = createPublicKey({
        key: Buffer.from(potSig.issuerPubKey, 'hex'),
        format: 'der',
        type: 'spki',
      });
      return verify(null, data, pubKey, sigBuffer);
    } catch {
      return false;
    }
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PotSigner = void 0;
// sdk/src/pot_signer.ts — Ed25519 signing for Proof of Time (Non-repudiation)
// Uses Node.js built-in crypto.sign/verify with Ed25519
const crypto_1 = require("crypto");
const fs_1 = require("fs");
class PotSigner {
    privateKey;
    publicKey;
    pubKeyHex;
    constructor(privateKeyHex) {
        if (privateKeyHex) {
            // Import existing key from PKCS8 DER hex
            const keyBuffer = Buffer.from(privateKeyHex, 'hex');
            this.privateKey = (0, crypto_1.createPrivateKey)({ key: keyBuffer, format: 'der', type: 'pkcs8' });
            this.publicKey = (0, crypto_1.createPublicKey)(this.privateKey);
        }
        else {
            // Generate new Ed25519 keypair
            const { privateKey, publicKey } = (0, crypto_1.generateKeyPairSync)('ed25519');
            this.privateKey = privateKey;
            this.publicKey = publicKey;
        }
        this.pubKeyHex = this.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
    }
    /** Returns the hex-encoded SPKI DER public key */
    getPubKeyHex() {
        return this.pubKeyHex;
    }
    /** Returns the hex-encoded PKCS8 DER private key (for persistence) */
    getPrivateKeyHex() {
        return this.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');
    }
    /**
     * Sign a PoT hash with Ed25519.
     * @param potHash - hex string (with or without 0x prefix) of the PoT hash
     * @returns PotSignature with issuerPubKey, signature, and issuedAt
     */
    signPot(potHash) {
        const data = Buffer.from(potHash.startsWith('0x') ? potHash.slice(2) : potHash, 'hex');
        const sig = (0, crypto_1.sign)(null, data, this.privateKey);
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
    /**
     * Load a PotSigner from a PKCS8 DER hex file.
     * @param path - path to file containing hex-encoded PKCS8 DER private key
     */
    static fromFile(path) {
        const hex = (0, fs_1.readFileSync)(path, 'utf-8').trim();
        return new PotSigner(hex);
    }
    /**
     * Load a PotSigner from file if it exists, otherwise generate a new one and save it.
     * @param path - path to file for persistent key storage
     */
    static createOrLoad(path) {
        if ((0, fs_1.existsSync)(path)) {
            return PotSigner.fromFile(path);
        }
        const signer = new PotSigner();
        signer.saveToFile(path);
        return signer;
    }
    /**
     * Save the private key (PKCS8 DER hex) to a file with mode 0o600.
     * @param path - destination file path
     */
    saveToFile(path) {
        (0, fs_1.writeFileSync)(path, this.getPrivateKeyHex(), { mode: 0o600 });
    }
    static verifyPotSignature(potHash, potSig, expectedPubKey) {
        if (expectedPubKey && potSig.issuerPubKey !== expectedPubKey)
            return false;
        try {
            const data = Buffer.from(potHash.startsWith('0x') ? potHash.slice(2) : potHash, 'hex');
            const sigBuffer = Buffer.from(potSig.signature, 'hex');
            const pubKey = (0, crypto_1.createPublicKey)({
                key: Buffer.from(potSig.issuerPubKey, 'hex'),
                format: 'der',
                type: 'spki',
            });
            return (0, crypto_1.verify)(null, data, pubKey, sigBuffer);
        }
        catch {
            return false;
        }
    }
}
exports.PotSigner = PotSigner;

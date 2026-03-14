export interface PotSignature {
    issuerPubKey: string;
    signature: string;
    issuedAt: bigint;
}
export declare class PotSigner {
    private privateKey;
    private publicKey;
    private pubKeyHex;
    constructor(privateKeyHex?: string);
    /** Returns the hex-encoded SPKI DER public key */
    getPubKeyHex(): string;
    /** Returns the hex-encoded PKCS8 DER private key (for persistence) */
    getPrivateKeyHex(): string;
    /**
     * Sign a PoT hash with Ed25519.
     * @param potHash - hex string (with or without 0x prefix) of the PoT hash
     * @returns PotSignature with issuerPubKey, signature, and issuedAt
     */
    signPot(potHash: string): PotSignature;
    /**
     * Verify a PotSignature against a PoT hash.
     * @param potHash - hex string (with or without 0x prefix)
     * @param potSig - the PotSignature to verify
     * @param expectedPubKey - optional: reject if issuerPubKey doesn't match
     * @returns true if signature is valid
     */
    static verifyPotSignature(potHash: string, potSig: PotSignature, expectedPubKey?: string): boolean;
}

import { Signer, Wallet } from "ethers";
/**
 * Supported signer types in TTT SDK
 */
export declare enum SignerType {
    PrivateKey = "privateKey",
    Turnkey = "turnkey",
    Privy = "privy",
    KMS = "kms"
}
/**
 * Discriminated union for signer configuration
 */
export type SignerConfig = {
    type: 'privateKey';
    key?: string;
    envVar?: string;
} | {
    type: 'turnkey';
    apiBaseUrl: string;
    organizationId: string;
    privateKeyId: string;
    apiPublicKey: string;
    apiPrivateKey: string;
} | {
    type: 'privy';
    appId: string;
    appSecret: string;
    walletId?: string;
} | {
    type: 'kms';
    provider: 'aws' | 'gcp';
    keyId: string;
    region?: string;
    projectId?: string;
    locationId?: string;
    keyRingId?: string;
    keyVersionId?: string;
};
/**
 * Base wrapper for all signers to ensure unified interface within the SDK
 */
export declare abstract class TTTAbstractSigner {
    readonly inner: Signer;
    constructor(inner: Signer);
    getAddress(): Promise<string>;
}
/**
 * Standard Private Key Signer (Institutional/Dev use)
 */
export declare class PrivateKeySigner extends TTTAbstractSigner {
    constructor(signer: Wallet);
}
/**
 * TEE-based institution-grade signer (Turnkey)
 */
export declare class TurnkeySignerWrapper extends TTTAbstractSigner {
    constructor(signer: Signer);
}
/**
 * Social/Embedded wallet signer (Privy)
 */
export declare class PrivySigner extends TTTAbstractSigner {
    constructor(signer: Signer);
}
/**
 * Cloud HSM (KMS) based signer
 */
export declare class KMSSigner extends TTTAbstractSigner {
    constructor(signer: Signer);
}
/**
 * Factory function to create appropriate signer based on config
 */
export declare function createSigner(config: SignerConfig): Promise<TTTAbstractSigner>;

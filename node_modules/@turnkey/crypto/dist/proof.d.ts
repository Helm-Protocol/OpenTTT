import type { v1AppProof, v1BootProof } from "@turnkey/sdk-types";
export declare const getCryptoInstance: () => Promise<Crypto>;
/**
 * verify goes through the following verification steps for an app proof & boot proof pair:
 *  - Verify app proof signature
 *  - Verify the boot proof
 *    - Attestation doc was signed by AWS
 *    - Attestation doc's `user_data` is the hash of the qos manifest
 *  - Verify the connection between the app proof & boot proof i.e. that the ephemeral keys match
 *
 *  For more information, check out https://whitepaper.turnkey.com/foundations
 */
export declare function verify(appProof: v1AppProof, bootProof: v1BootProof): Promise<void>;
/**
 * Verify app proof signature with @noble/curves
 */
export declare function verifyAppProofSignature(appProof: v1AppProof): void;
export declare function verifyCertificateChain(cabundle: Uint8Array[], rootCertPem: string, leafCert: Uint8Array, timestampMs: number): Promise<void>;
export declare function verifyCoseSign1Sig(coseSign1: any, leaf: Uint8Array): Promise<void>;
//# sourceMappingURL=proof.d.ts.map
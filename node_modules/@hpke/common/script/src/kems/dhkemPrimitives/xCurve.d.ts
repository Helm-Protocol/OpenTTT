import type { DhkemPrimitives } from "../../interfaces/dhkemPrimitives.js";
import type { KdfInterface } from "../../interfaces/kdfInterface.js";
import type { MontgomeryECDH } from "../../curve/montgomery.js";
/**
 * Base DhkemPrimitives implementation for Montgomery curves (X25519/X448).
 *
 * Subclasses pass curve-specific parameters (algorithm name, key size, curve)
 * and optionally add extra methods (e.g., raw derive for X25519).
 */
export declare class XCurveDhkemPrimitives implements DhkemPrimitives {
    private _algName;
    protected _curve: MontgomeryECDH;
    private _hkdf;
    private _nPk;
    private _nSk;
    constructor(algName: string, keySize: number, curve: MontgomeryECDH, hkdf: KdfInterface);
    serializePublicKey(key: CryptoKey): Promise<ArrayBuffer>;
    deserializePublicKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey>;
    serializePrivateKey(key: CryptoKey): Promise<ArrayBuffer>;
    deserializePrivateKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey>;
    importKey(format: "raw" | "jwk", key: ArrayBuffer | JsonWebKey, isPublic: boolean): Promise<CryptoKey>;
    generateKeyPair(): Promise<CryptoKeyPair>;
    deriveKeyPair(ikm: ArrayBufferLike | ArrayBufferView): Promise<CryptoKeyPair>;
    derivePublicKey(key: CryptoKey): Promise<CryptoKey>;
    dh(sk: CryptoKey, pk: CryptoKey): Promise<ArrayBuffer>;
    private _importRawKey;
    private _importJWK;
}
//# sourceMappingURL=xCurve.d.ts.map
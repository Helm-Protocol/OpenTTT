export declare const KEM_USAGES: KeyUsage[];
export declare const LABEL_DKP_PRK: Uint8Array;
export declare const LABEL_SK: Uint8Array;
export interface DhkemPrimitives {
    serializePublicKey(key: CryptoKey): Promise<ArrayBuffer>;
    deserializePublicKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey>;
    serializePrivateKey(key: CryptoKey): Promise<ArrayBuffer>;
    deserializePrivateKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey>;
    importKey(format: "raw" | "jwk", key: ArrayBuffer | JsonWebKey, isPublic: boolean): Promise<CryptoKey>;
    generateKeyPair(): Promise<CryptoKeyPair>;
    deriveKeyPair(ikm: ArrayBufferLike | ArrayBufferView): Promise<CryptoKeyPair>;
    derivePublicKey(key: CryptoKey): Promise<CryptoKey>;
    dh(sk: CryptoKey, pk: CryptoKey): Promise<ArrayBuffer>;
}
//# sourceMappingURL=dhkemPrimitives.d.ts.map
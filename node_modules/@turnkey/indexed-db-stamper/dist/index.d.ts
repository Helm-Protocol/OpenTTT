export declare class IndexedDbStamper {
    private publicKeyHex;
    private privateKey;
    constructor();
    private openDb;
    private storeKeyPair;
    private getStoredKeys;
    init(): Promise<void>;
    resetKeyPair(externalKeyPair?: CryptoKeyPair): Promise<void>;
    getPublicKey(): string | null;
    sign(payload: string): Promise<string>;
    stamp(payload: string): Promise<{
        stampHeaderName: string;
        stampHeaderValue: string;
    }>;
    clear(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map
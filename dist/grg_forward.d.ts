export declare class GrgForward {
    static golombEncode(data: Uint8Array, m?: number): Uint8Array;
    static redstuffEncode(data: Uint8Array, shards?: number, parity?: number): Uint8Array[];
    /**
     * Derives an HMAC key from GRG payload context (chainId + poolAddress).
     * Falls back to a static domain-separation key when no context is provided.
     */
    static deriveHmacKey(chainId?: number, poolAddress?: string): Buffer;
    static golayEncodeWrapper(data: Uint8Array, hmacKey?: Buffer): Uint8Array;
    static encode(data: Uint8Array, chainId?: number, poolAddress?: string): Uint8Array[];
}

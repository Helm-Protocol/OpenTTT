export declare class GrgForward {
    /**
     * Golomb-Rice encoding.
     *
     * Golomb-Rice is optimal for small-value biased distributions (e.g., timestamp deltas).
     * For uniformly distributed data (random bytes), expect ~50% expansion.
     * The primary purpose in the GRG pipeline is structured encoding for error correction,
     * not compression.
     *
     * @param data  Raw bytes to encode.
     * @param m     Golomb divisor (must be a power of 2, default 16).
     */
    static golombEncode(data: Uint8Array, m?: number): Uint8Array;
    static redstuffEncode(data: Uint8Array, shards?: number, parity?: number): Uint8Array[];
    /**
     * Derives an HMAC key from GRG payload context (chainId + poolAddress).
     * Both parameters are required — no default key fallback.
     */
    static deriveHmacKey(chainId: number, poolAddress: string): Buffer;
    static golayEncodeWrapper(data: Uint8Array, hmacKey: Buffer): Uint8Array;
    static encode(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[];
}

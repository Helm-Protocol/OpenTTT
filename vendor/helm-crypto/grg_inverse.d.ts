export declare class GrgInverse {
    static golayDecodeWrapper(data: Uint8Array, hmacKey: Buffer): Uint8Array;
    static redstuffDecode(shards: (Uint8Array | null)[], dataShardCount?: number, parityShardCount?: number): Uint8Array;
    private static readonly MAX_GOLOMB_Q;
    /**
     * Decode a Golomb-Rice compressed byte stream.
     *
     * @param data - Golomb-encoded bit-packed bytes
     * @param m - Golomb divisor (must be power of 2, default 16)
     * @param originalLength - If provided, stop decoding once this many values
     *   have been emitted. This prevents phantom trailing bytes caused by
     *   zero-padding in the last byte of the encoded stream.
     */
    static golombDecode(data: Uint8Array, m?: number, originalLength?: number): Uint8Array;
    static verify(data: Uint8Array, originalShards: Uint8Array[], chainId: number, poolAddress: string): boolean;
}

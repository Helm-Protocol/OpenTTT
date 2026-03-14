export declare class GrgInverse {
    static golayDecodeWrapper(data: Uint8Array, hmacKey?: Buffer): Uint8Array;
    static redstuffDecode(shards: (Uint8Array | null)[], dataShardCount?: number, parityShardCount?: number): Uint8Array;
    private static readonly MAX_GOLOMB_Q;
    static golombDecode(data: Uint8Array, m?: number): Uint8Array;
    static verify(data: Uint8Array, originalShards: Uint8Array[], chainId?: number, poolAddress?: string): boolean;
}

export declare class GrgInverse {
    private static readonly MAX_GOLOMB_Q;
    static golayDecodeWrapper(data: Uint8Array, hmacKey: Buffer): Uint8Array;
    static redstuffDecode(shards: (Uint8Array | null)[], dataShardCount?: number, parityShardCount?: number): Uint8Array;
    static golombDecode(data: Uint8Array, m?: number, originalLength?: number): Uint8Array;
    static verify(data: Uint8Array, originalShards: Uint8Array[], chainId: number, poolAddress: string): boolean;
}

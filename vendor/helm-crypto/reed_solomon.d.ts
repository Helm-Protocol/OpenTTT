export declare class ReedSolomon {
    private static expTable;
    private static logTable;
    private static initialized;
    /**
     * Static Vandermonde matrix cache keyed by "${totalShards}-${dataShards}".
     * Avoids recomputing the GF(2^8) Vandermonde + inverse on every tick,
     * which is the most expensive part of RS encoding/decoding.
     */
    private static vandermondeCache;
    static init(): void;
    static mul(a: number, b: number): number;
    static div(a: number, b: number): number;
    private static invertMatrix;
    /**
     * Build (or retrieve from cache) the normalized Vandermonde encoding matrix.
     * Cache key: "${rows}-${cols}" — RS parameters rarely change within a session,
     * so caching eliminates redundant GF(2^8) matrix inversion on every tick.
     */
    private static buildVandermonde;
    static encode(data: Uint8Array, dataShards?: number, parityShards?: number): Uint8Array[];
    /**
     * Decode data from a set of Reed-Solomon shards (data + parity).
     *
     * Shards should be provided in order of reliability: place higher-quality,
     * more trustworthy shards first. The decoder selects the first `dataShards`
     * non-null entries for recovery, so ordering by reliability ensures the
     * most dependable shards are preferred. The implementation already handles
     * missing (null) shards transparently via GF(2^8) matrix inversion.
     *
     * @param shards - Array of shard buffers (null for missing/corrupted shards)
     * @param dataShards - Number of data shards (default 4)
     * @param parityShards - Number of parity shards (default 2)
     * @returns Reconstructed data as a single Uint8Array
     */
    static decode(shards: (Uint8Array | null)[], dataShards?: number, parityShards?: number): Uint8Array;
}

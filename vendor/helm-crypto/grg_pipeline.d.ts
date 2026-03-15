export declare class GrgPipeline {
    static readonly MAX_INPUT_SIZE: number;
    /**
     * Runs the full forward pipeline:
     * Golomb-Rice -> RedStuff (Erasure) -> Golay(24,12)
     */
    static processForward(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[];
    /**
     * Runs the full inverse pipeline:
     * Golay(24,12) -> RedStuff (Reconstruction) -> Golomb-Rice Decompression
     */
    static processInverse(shards: Uint8Array[], originalLength: number, chainId: number, poolAddress: string): Uint8Array;
}

export declare class GrgPipeline {
    private static readonly MAX_INPUT_SIZE;
    static processForward(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[];
    static processInverse(shards: (Uint8Array | null)[], originalLength: number, chainId: number, poolAddress: string): Uint8Array;
}

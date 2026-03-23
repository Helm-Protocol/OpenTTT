export declare class GrgPipeline {
    static readonly MAX_INPUT_SIZE: number;
    static processForward(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[];
    static processInverse(shards: (Uint8Array | null)[], originalLength: number, chainId: number, poolAddress: string): Uint8Array;
}

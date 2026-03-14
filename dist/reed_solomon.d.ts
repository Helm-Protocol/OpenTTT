export declare class ReedSolomon {
    private static expTable;
    private static logTable;
    private static initialized;
    static init(): void;
    static mul(a: number, b: number): number;
    static div(a: number, b: number): number;
    private static invertMatrix;
    private static buildVandermonde;
    static encode(data: Uint8Array, dataShards?: number, parityShards?: number): Uint8Array[];
    static decode(shards: (Uint8Array | null)[], dataShards?: number, parityShards?: number): Uint8Array;
}

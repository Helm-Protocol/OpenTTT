export declare class ReedSolomon {
    private static expTable;
    private static logTable;
    private static initialized;
    private static vandermondeCache;
    static init(): void;
    static mul(a: number, b: number): number;
    static div(a: number, b: number): number;
    static invertMatrix(matrix: number[][]): number[][];
    static buildVandermonde(rows: number, cols: number): number[][];
    static encode(data: Uint8Array, dataShards?: number, parityShards?: number): Uint8Array[];
    static decode(shards: (Uint8Array | null)[], dataShards?: number, parityShards?: number): Uint8Array;
}

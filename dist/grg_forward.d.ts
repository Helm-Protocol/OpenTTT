export declare class GrgForward {
    static golombEncode(data: Uint8Array, m?: number): Uint8Array;
    static redstuffEncode(data: Uint8Array, shards?: number, parity?: number): Uint8Array[];
    static golayEncodeWrapper(data: Uint8Array): Uint8Array;
    static encode(data: Uint8Array): Uint8Array[];
}

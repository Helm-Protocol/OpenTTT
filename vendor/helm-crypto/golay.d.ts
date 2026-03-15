export declare function golayEncode(data: Uint8Array): Uint8Array;
export declare function golayDecode(encoded: Uint8Array): {
    data: Uint8Array;
    corrected: number;
    uncorrectable: boolean;
};

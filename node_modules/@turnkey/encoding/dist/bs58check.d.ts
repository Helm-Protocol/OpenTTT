type Bs58Check = {
    encode(payload: Uint8Array | number[]): string;
    decode(str: string): Uint8Array;
    decodeUnsafe(str: string): Uint8Array | undefined;
};
export declare const bs58check: Bs58Check;
export {};
//# sourceMappingURL=bs58check.d.ts.map
/**
 * This file is based on noble-hashes (https://github.com/paulmillr/noble-hashes).
 *
 * noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com)
 *
 * The original file is located at:
 * https://github.com/paulmillr/noble-hashes/blob/4e358a46d682adfb005ae6314ec999f2513086b9/src/sha3.ts
 */
import { type CHash, type CHashXOF, type Hash, type HashXOF } from "./hash.js";
/** `keccakf1600` internal function, additionally allows to adjust round count. */
export declare function keccakP(s: Uint32Array, rounds?: number, B?: Uint32Array): void;
/** Keccak sponge function. */
export declare class Keccak implements Hash<Keccak>, HashXOF<Keccak> {
    protected state: Uint8Array;
    protected pos: number;
    protected posOut: number;
    protected finished: boolean;
    protected state32: Uint32Array;
    protected destroyed: boolean;
    private _B;
    blockLen: number;
    suffix: number;
    outputLen: number;
    protected enableXOF: boolean;
    protected rounds: number;
    constructor(blockLen: number, suffix: number, outputLen: number, enableXOF?: boolean, rounds?: number);
    clone(): Keccak;
    /** Resets instance to initial (empty) state for reuse. */
    reset(): void;
    protected keccak(): void;
    update(data: Uint8Array): this;
    /** Like update(), but skips validation. Caller must ensure valid state and input. */
    updateUnsafe(data: Uint8Array): this;
    protected finish(): void;
    protected writeInto(out: Uint8Array): Uint8Array;
    /** Like writeInto(), but skips validation. Caller must ensure valid state and output. */
    writeIntoUnsafe(out: Uint8Array): Uint8Array;
    xofInto(out: Uint8Array): Uint8Array;
    xof(bytes: number): Uint8Array;
    digestInto(out: Uint8Array): Uint8Array;
    digest(): Uint8Array;
    destroy(): void;
    _cloneInto(to?: Keccak): Keccak;
}
/** SHA3-256 hash function. Different from keccak-256. */
export declare const sha3_256: CHash;
/** SHA3-384 hash function. */
export declare const sha3_384: CHash;
/** SHA3-512 hash function. */
export declare const sha3_512: CHash;
/** keccak-224 hash function. */
export declare const keccak_224: CHash;
/** keccak-256 hash function. Different from SHA3-256. */
export declare const keccak_256: CHash;
/** keccak-384 hash function. */
export declare const keccak_384: CHash;
/** keccak-512 hash function. */
export declare const keccak_512: CHash;
export type ShakeOpts = {
    dkLen?: number;
};
/** SHAKE128 XOF with 128-bit security. */
export declare const shake128: CHashXOF<Keccak, ShakeOpts>;
/** SHAKE256 XOF with 256-bit security. */
export declare const shake256: CHashXOF<Keccak, ShakeOpts>;
//# sourceMappingURL=sha3.d.ts.map
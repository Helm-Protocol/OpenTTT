/**
 * This file is based on noble-ciphers (https://github.com/paulmillr/noble-ciphers).
 *
 * noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com)
 *
 * The original file is located at:
 * https://github.com/paulmillr/noble-ciphers/blob/749cdf9cd07ebdd19e9b957d0f172f1045179695/src/utils.ts
 */
/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
import { abytes, aexists, anumber, aoutput, clean, copyBytes, createView, isLE, type TypedArray, u32 } from "@hpke/common";
export { abytes, aexists, anumber, aoutput, clean, copyBytes, createView, isLE, type TypedArray, u32, };
/** Asserts something is boolean. */
export declare function abool(b: boolean): void;
/** Cast u8 / u16 / u32 to u8. */
export declare function u8(arr: TypedArray): Uint8Array;
export interface IHash2 {
    blockLen: number;
    outputLen: number;
    update(buf: string | Uint8Array): this;
    digestInto(buf: Uint8Array): void;
    digest(): Uint8Array;
    /**
     * Resets internal state. Makes Hash instance unusable.
     * Reset is impossible for keyed hashes if key is consumed into state. If digest is not consumed
     * by user, they will need to manually call `destroy()` when zeroing is necessary.
     */
    destroy(): void;
}
/** Sync cipher: takes byte array and returns byte array. */
export type Cipher = {
    encrypt(plaintext: Uint8Array): Uint8Array;
    decrypt(ciphertext: Uint8Array): Uint8Array;
};
/** Cipher with `output` argument which can optimize by doing 1 less allocation. */
export type CipherWithOutput = Cipher & {
    encrypt(plaintext: Uint8Array, output?: Uint8Array): Uint8Array;
    decrypt(ciphertext: Uint8Array, output?: Uint8Array): Uint8Array;
};
/**
 * Params are outside of return type, so it is accessible before calling constructor.
 * If function support multiple nonceLength's, we return the best one.
 */
type CipherParams = {
    blockSize: number;
    nonceLength?: number;
    tagLength?: number;
    varSizeNonce?: boolean;
};
/** ARX cipher, like salsa or chacha. */
export type ARXCipher = ((key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array) => CipherWithOutput) & {
    blockSize: number;
    nonceLength: number;
    tagLength: number;
};
type CipherCons<T extends any[]> = (key: Uint8Array, ...args: T) => Cipher;
/**
 * Wraps a cipher: validates args, ensures encrypt() can only be called once.
 * @__NO_SIDE_EFFECTS__
 */
export declare const wrapCipher: <C extends CipherCons<any>, P extends CipherParams>(params: P, constructor: C) => C & P;
/** Represents salsa / chacha stream. */
export type XorStream = (key: Uint8Array, nonce: Uint8Array, data: Uint8Array, output?: Uint8Array, counter?: number) => Uint8Array;
type EmptyObj = {};
export declare function checkOpts<T1 extends EmptyObj, T2 extends EmptyObj>(defaults: T1, opts: T2): T1 & T2;
/** Compares 2 uint8array-s in kinda constant time. */
export declare function equalBytes(a: Uint8Array, b: Uint8Array): boolean;
/**
 * By default, returns u8a of length.
 * When out is available, it checks it for validity and uses it.
 */
export declare function getOutput(expectedLength: number, out?: Uint8Array, onlyAligned?: boolean): Uint8Array;
export declare function u64Lengths(dataLength: number, aadLength: number, isLE: boolean): Uint8Array;
export declare function isAligned32(bytes: Uint8Array): boolean;
//# sourceMappingURL=utils.d.ts.map
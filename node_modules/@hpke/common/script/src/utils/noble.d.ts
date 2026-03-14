/**
 * This file is based on noble-curves (https://github.com/paulmillr/noble-curves).
 *
 * noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com)
 *
 * The original file is located at:
 * https://github.com/paulmillr/noble-curves/blob/b9d49d2b41d550571a0c5be443ecb62109fa3373/src/utils.ts
 */
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
export declare function isBytes(a: unknown): a is Uint8Array;
/** Asserts something is positive integer. */
export declare function anumber(n: number, title?: string): void;
/** Asserts something is Uint8Array. */
export declare function abytes(value: Uint8Array, length?: number, title?: string): Uint8Array;
/** Asserts a hash instance has not been destroyed / finished */
export declare function aexists(instance: any, checkFinished?: boolean): void;
/** Asserts output is properly-sized byte array */
export declare function aoutput(out: any, instance: any): void;
/** Generic type encompassing 8/16/32-byte arrays - but not 64-byte. */
export type TypedArray = Int8Array | Uint8ClampedArray | Uint8Array | Uint16Array | Int16Array | Uint32Array | Int32Array;
/** Cast u8 / u16 / u32 to u32. */
export declare function u32(arr: TypedArray): Uint32Array;
/** Zeroize a byte array. Warning: JS provides no guarantees. */
export declare function clean(...arrays: TypedArray[]): void;
/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
export declare const isLE: boolean;
/** The byte swap operation for uint32 */
export declare function byteSwap(word: number): number;
/** Conditionally byte swap if on a big-endian platform */
export declare function swap8IfBE(n: number): number;
/** @deprecated */
export declare const byteSwapIfBE: typeof swap8IfBE;
/** In place byte swap for Uint32Array */
export declare function byteSwap32(arr: Uint32Array): Uint32Array;
export declare function swap32IfBE(u: Uint32Array): Uint32Array;
/** Create DataView of an array for easy byte-level manipulation. */
export declare function createView(arr: TypedArray): DataView;
/** The rotate right (circular right shift) operation for uint32 */
export declare function rotr(word: number, shift: number): number;
/**
 * Convert byte array to hex string. Uses built-in function, when available.
 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
 */
export declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Convert hex string to byte array. Uses built-in function, when available.
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Converts string to bytes using UTF8 encoding.
 * @example utf8ToBytes('abc') // Uint8Array.from([97, 98, 99])
 */
export declare function utf8ToBytes(str: string): Uint8Array;
/**
 * Converts bytes to string using UTF8 encoding.
 * @example bytesToUtf8(Uint8Array.from([97, 98, 99])) // 'abc'
 */
export declare function bytesToUtf8(bytes: Uint8Array): string;
export declare function numberToHexUnpadded(num: number | bigint): string;
export declare function hexToNumber(hex: string): bigint;
export declare function numberToBigint(num: number): bigint;
export declare function bytesToNumberBE(bytes: Uint8Array): bigint;
export declare function bytesToNumberLE(bytes: Uint8Array): bigint;
export declare function numberToBytesBE(n: number | bigint, len: number): Uint8Array;
export declare function numberToBytesLE(n: number | bigint, len: number): Uint8Array;
/**
 * Copies Uint8Array. We can't use u8a.slice(), because u8a can be Buffer,
 * and Buffer#slice creates mutable copy. Never use Buffers!
 */
export declare function copyBytes(bytes: Uint8Array): Uint8Array;
/** Copies several Uint8Arrays into one. */
export declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;
/**
 * Decodes 7-bit ASCII string to Uint8Array, throws on non-ascii symbols
 * Should be safe to use for things expected to be ASCII.
 * Returns exact same result as utf8ToBytes for ASCII or throws.
 */
export declare function asciiToBytes(ascii: string): Uint8Array;
export declare function inRange(n: bigint, min: bigint, max: bigint): boolean;
/**
 * Asserts min <= n < max. NOTE: It's < max and not <= max.
 * @example
 * aInRange('x', x, 1n, 256n); // would assume x is in (1n..255n)
 */
export declare function aInRange(title: string, n: bigint, min: bigint, max: bigint): void;
export declare function validateObject(object: Record<string, any>, fields?: Record<string, string>, optFields?: Record<string, string>): void;
export interface CryptoKeys {
    lengths: {
        seed?: number;
        public?: number;
        secret?: number;
    };
    keygen: (seed?: Uint8Array) => {
        secretKey: Uint8Array;
        publicKey: Uint8Array;
    };
    getPublicKey: (secretKey: Uint8Array) => Uint8Array;
}
/** Generic interface for signatures. Has keygen, sign and verify. */
export interface Signer extends CryptoKeys {
    lengths: {
        seed?: number;
        public?: number;
        secret?: number;
        signRand?: number;
        signature?: number;
    };
    sign: (msg: Uint8Array, secretKey: Uint8Array) => Uint8Array;
    verify: (sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array) => boolean;
}
/** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
export declare function randomBytesAsync(bytesLength?: number): Promise<Uint8Array>;
export declare function oidNist(suffix: number): {
    oid: Uint8Array;
};
//# sourceMappingURL=noble.d.ts.map
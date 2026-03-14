/**
 * Converts a Uint8Array into a lowercase hex string.
 *
 * @param {Uint8Array} input - The input byte array.
 * @returns {string} - The resulting hex string.
 */
export declare function uint8ArrayToHexString(input: Uint8Array): string;
/**
 * Creates a Uint8Array from a hex string.
 *
 * @param {string} hexString - The input hex string.
 * @param {number} [length] - Optional target length for the output. If specified,
 * the result will be padded with leading 0s or throw if it overflows.
 * @returns {Uint8Array} - The resulting byte array.
 * @throws {Error} - If the hex string is invalid or too long for the specified length.
 */
export declare const uint8ArrayFromHexString: (hexString: string, length?: number) => Uint8Array;
/**
 * Converts a hex string to an ASCII string.
 * @param {string} hexString - The input hex string to convert.
 * @returns {string} - The converted ASCII string.
 */
export declare function hexToAscii(hexString: string): string;
/**
 * Function to normalize padding of byte array with 0's to a target length.
 *
 * @param {Uint8Array} byteArray - The byte array to pad or trim.
 * @param {number} targetLength - The target length after padding or trimming.
 * @returns {Uint8Array} - The normalized byte array.
 */
export declare const normalizePadding: (byteArray: Uint8Array, targetLength: number) => Uint8Array;
//# sourceMappingURL=hex.d.ts.map
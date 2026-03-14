/**
 * Compresses an uncompressed P-256 public key into its 33-byte compressed form.
 *
 * @param {Uint8Array} raw - The uncompressed public key (65 bytes, starting with 0x04).
 * @returns {Uint8Array} - The compressed public key (33 bytes, starting with 0x02 or 0x03).
 * @throws {Error} - If the input key is not a valid uncompressed P-256 key.
 */
export declare function pointEncode(raw: Uint8Array): Uint8Array;
//# sourceMappingURL=encode.d.ts.map
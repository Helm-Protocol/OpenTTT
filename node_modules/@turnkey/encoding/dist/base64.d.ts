/**
 * Code modified from https://github.com/github/webauthn-json/blob/e932b3585fa70b0bd5b5a4012ba7dbad7b0a0d0f/src/webauthn-json/base64url.ts#L23
 */
/**
 * Converts a plain string into a base64url-encoded string.
 *
 * @param {string} input - The input string to encode.
 * @returns {string} - The base64url-encoded string.
 */
export declare function stringToBase64urlString(input: string): string;
/**
 * Converts a hex string into a base64url-encoded string.
 *
 * @param {string} input - The input hex string.
 * @param {number} [length] - Optional length for the resulting buffer. Pads with leading 0s if needed.
 * @returns {string} - The base64url-encoded representation of the hex string.
 * @throws {Error} - If the hex string is invalid or too long for the specified length.
 */
export declare function hexStringToBase64url(input: string, length?: number): string;
/**
 * Converts a base64 string into a base64url-encoded string.
 *
 * @param {string} input - The input base64 string.
 * @returns {string} - The base64url-encoded string.
 */
export declare function base64StringToBase64UrlEncodedString(input: string): string;
/**
 * Converts a base64url-encoded string into a standard base64-encoded string.
 *
 * - Replaces URL-safe characters (`-` and `_`) back to standard base64 characters (`+` and `/`).
 * - Pads the result with `=` to ensure the length is a multiple of 4.
 *
 * @param {string} input - The base64url-encoded string to convert.
 * @returns {string} - The equivalent base64-encoded string.
 */
export declare function base64UrlToBase64(input: string): string;
/**
 * Decodes a base64url-encoded string into a plain UTF-8 string.
 *
 * - Converts the input from base64url to base64.
 * - Decodes the base64 string into a plain string using a pure JS `atob` implementation.
 *
 * @param {string} input - The base64url-encoded string to decode.
 * @returns {string} - The decoded plain string.
 * @throws {Error} If the input is not correctly base64url/base64 encoded.
 */
export declare function decodeBase64urlToString(input: string): string;
export declare function atob(input: string): string;
//# sourceMappingURL=base64.d.ts.map
/**
 * This file is based on noble-ciphers (https://github.com/paulmillr/noble-ciphers).
 *
 * noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com)
 *
 * The original file is located at:
 * https://github.com/paulmillr/noble-ciphers/blob/749cdf9cd07ebdd19e9b957d0f172f1045179695/src/utils.ts
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@hpke/common"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.wrapCipher = exports.u32 = exports.isLE = exports.createView = exports.copyBytes = exports.clean = exports.aoutput = exports.anumber = exports.aexists = exports.abytes = void 0;
    exports.abool = abool;
    exports.u8 = u8;
    exports.checkOpts = checkOpts;
    exports.equalBytes = equalBytes;
    exports.getOutput = getOutput;
    exports.u64Lengths = u64Lengths;
    exports.isAligned32 = isAligned32;
    /**
     * Utilities for hex, bytes, CSPRNG.
     * @module
     */
    const common_1 = require("@hpke/common");
    Object.defineProperty(exports, "abytes", { enumerable: true, get: function () { return common_1.abytes; } });
    Object.defineProperty(exports, "aexists", { enumerable: true, get: function () { return common_1.aexists; } });
    Object.defineProperty(exports, "anumber", { enumerable: true, get: function () { return common_1.anumber; } });
    Object.defineProperty(exports, "aoutput", { enumerable: true, get: function () { return common_1.aoutput; } });
    Object.defineProperty(exports, "clean", { enumerable: true, get: function () { return common_1.clean; } });
    Object.defineProperty(exports, "copyBytes", { enumerable: true, get: function () { return common_1.copyBytes; } });
    Object.defineProperty(exports, "createView", { enumerable: true, get: function () { return common_1.createView; } });
    Object.defineProperty(exports, "isLE", { enumerable: true, get: function () { return common_1.isLE; } });
    Object.defineProperty(exports, "u32", { enumerable: true, get: function () { return common_1.u32; } });
    /** Asserts something is boolean. */
    function abool(b) {
        if (typeof b !== "boolean")
            throw new Error(`boolean expected, not ${b}`);
    }
    /** Cast u8 / u16 / u32 to u8. */
    function u8(arr) {
        return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    /**
     * Wraps a cipher: validates args, ensures encrypt() can only be called once.
     * @__NO_SIDE_EFFECTS__
     */
    // deno-lint-ignore no-explicit-any
    const wrapCipher = (params, constructor) => {
        // deno-lint-ignore no-explicit-any
        function wrappedCipher(key, ...args) {
            // Validate key
            (0, common_1.abytes)(key, undefined, "key");
            // Big-Endian hardware is rare. Just in case someone still decides to run ciphers:
            if (!common_1.isLE) {
                throw new Error("Non little-endian hardware is not yet supported");
            }
            // Validate nonce if nonceLength is present
            if (params.nonceLength !== undefined) {
                const nonce = args[0];
                (0, common_1.abytes)(nonce, params.varSizeNonce ? undefined : params.nonceLength, "nonce");
            }
            // Validate AAD if tagLength present
            const tagl = params.tagLength;
            if (tagl && args[1] !== undefined)
                (0, common_1.abytes)(args[1], undefined, "AAD");
            const cipher = constructor(key, ...args);
            const checkOutput = (fnLength, output) => {
                if (output !== undefined) {
                    if (fnLength !== 2)
                        throw new Error("cipher output not supported");
                    (0, common_1.abytes)(output, undefined, "output");
                }
            };
            // Create wrapped cipher with validation and single-use encryption
            let called = false;
            const wrCipher = {
                encrypt(data, output) {
                    if (called) {
                        throw new Error("cannot encrypt() twice with same key + nonce");
                    }
                    called = true;
                    (0, common_1.abytes)(data);
                    checkOutput(cipher.encrypt.length, output);
                    return cipher.encrypt(data, output);
                },
                decrypt(data, output) {
                    (0, common_1.abytes)(data);
                    if (tagl && data.length < tagl) {
                        throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
                    }
                    checkOutput(cipher.decrypt.length, output);
                    return cipher.decrypt(data, output);
                },
            };
            return wrCipher;
        }
        Object.assign(wrappedCipher, params);
        return wrappedCipher;
    };
    exports.wrapCipher = wrapCipher;
    function checkOpts(defaults, opts) {
        if (opts == null || typeof opts !== "object") {
            throw new Error("options must be defined");
        }
        const merged = Object.assign(defaults, opts);
        return merged;
    }
    /** Compares 2 uint8array-s in kinda constant time. */
    function equalBytes(a, b) {
        if (a.length !== b.length)
            return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++)
            diff |= a[i] ^ b[i];
        return diff === 0;
    }
    /**
     * By default, returns u8a of length.
     * When out is available, it checks it for validity and uses it.
     */
    function getOutput(expectedLength, out, onlyAligned = true) {
        if (out === undefined)
            return new Uint8Array(expectedLength);
        if (out.length !== expectedLength) {
            throw new Error('"output" expected Uint8Array of length ' + expectedLength + ", got: " +
                out.length);
        }
        if (onlyAligned && !isAligned32(out)) {
            throw new Error("invalid output, must be aligned");
        }
        return out;
    }
    function u64Lengths(dataLength, aadLength, isLE) {
        abool(isLE);
        const num = new Uint8Array(16);
        const view = (0, common_1.createView)(num);
        view.setBigUint64(0, (0, common_1.numberToBigint)(aadLength), isLE);
        view.setBigUint64(8, (0, common_1.numberToBigint)(dataLength), isLE);
        return num;
    }
    // Is byte array aligned to 4 byte offset (u32)?
    function isAligned32(bytes) {
        return bytes.byteOffset % 4 === 0;
    }
});
// copy bytes to new u8a (aligned). Because Buffer.slice is broken.
// Re-exported from @hpke/common.

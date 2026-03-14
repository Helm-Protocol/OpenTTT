(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BYTE_TO_BIGINT_256 = exports.N_0x71 = exports.N_256 = exports.N_32 = exports.N_7 = exports.N_2 = exports.N_1 = exports.N_0 = exports.EMPTY = exports.MINIMUM_PSK_LENGTH = exports.INFO_LENGTH_LIMIT = exports.INPUT_LENGTH_LIMIT = void 0;
    // The input length limit (psk, psk_id, info, exporter_context, ikm).
    exports.INPUT_LENGTH_LIMIT = 8192;
    exports.INFO_LENGTH_LIMIT = 268435456;
    // The minimum length of a PSK.
    exports.MINIMUM_PSK_LENGTH = 32;
    // b""
    exports.EMPTY = new Uint8Array(0);
    // Common BigInt constants
    exports.N_0 = 0n;
    exports.N_1 = 1n;
    exports.N_2 = 2n;
    exports.N_7 = 7n;
    exports.N_32 = 32n;
    exports.N_256 = 256n;
    exports.N_0x71 = 0x71n;
    exports.BYTE_TO_BIGINT_256 = (() => {
        const out = new Array(256);
        let i = 0;
        let value = 0n;
        while (i < 256) {
            out[i] = value;
            i++;
            value += 1n;
        }
        return out;
    })();
});

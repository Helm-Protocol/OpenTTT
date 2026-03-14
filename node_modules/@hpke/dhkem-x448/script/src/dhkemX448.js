(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@hpke/common", "./primitives/x448.js", "./hkdfSha512.js"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DhkemX448HkdfSha512 = exports.X448 = void 0;
    const common_1 = require("@hpke/common");
    const x448_js_1 = require("./primitives/x448.js");
    const hkdfSha512_js_1 = require("./hkdfSha512.js");
    class X448 extends common_1.XCurveDhkemPrimitives {
        constructor(hkdf) {
            super("X448", 56, x448_js_1.x448, hkdf);
        }
    }
    exports.X448 = X448;
    /**
     * The DHKEM(X448, HKDF-SHA512) for HPKE KEM implementing {@link KemInterface}.
     *
     * This class is implemented using
     * {@link https://github.com/paulmillr/noble-curves | @noble/curves}.
     *
     * The instance of this class can be specified to the
     * {@link https://jsr.io/@hpke/core/doc/~/CipherSuiteParams | CipherSuiteParams} as follows:
     *
     * @example Use with `@hpke/core`:
     *
     * ```ts
     * import {
     *   Aes256Gcm,
     *   CipherSuite,
     *   HkdfSha512,
     * } from "@hpke/core";
     * import { DhkemX448HkdfSha512 } from "@hpke/dhkem-x448";
     *
     * const suite = new CipherSuite({
     *   kem: new DhkemX448HkdfSha512(),
     *   kdf: new HkdfSha512(),
     *   aead: new Aes256Gcm(),
     * });
     * ```
     */
    class DhkemX448HkdfSha512 extends common_1.Dhkem {
        constructor() {
            const kdf = new hkdfSha512_js_1.HkdfSha512();
            super(common_1.KemId.DhkemX448HkdfSha512, new X448(kdf), kdf);
            /** KemId.DhkemX448HkdfSha512 (0x0021) */
            Object.defineProperty(this, "id", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: common_1.KemId.DhkemX448HkdfSha512
            });
            /** 64 */
            Object.defineProperty(this, "secretSize", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 64
            });
            /** 56 */
            Object.defineProperty(this, "encSize", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 56
            });
            /** 56 */
            Object.defineProperty(this, "publicKeySize", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 56
            });
            /** 56 */
            Object.defineProperty(this, "privateKeySize", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 56
            });
        }
    }
    exports.DhkemX448HkdfSha512 = DhkemX448HkdfSha512;
});

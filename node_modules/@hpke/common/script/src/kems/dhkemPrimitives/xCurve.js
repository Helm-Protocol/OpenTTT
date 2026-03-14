(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "../../consts.js", "../../errors.js", "../../kdfs/hkdf.js", "../../interfaces/dhkemPrimitives.js", "../../utils/misc.js", "../../xCryptoKey.js"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.XCurveDhkemPrimitives = void 0;
    const consts_js_1 = require("../../consts.js");
    const errors_js_1 = require("../../errors.js");
    const hkdf_js_1 = require("../../kdfs/hkdf.js");
    const dhkemPrimitives_js_1 = require("../../interfaces/dhkemPrimitives.js");
    const misc_js_1 = require("../../utils/misc.js");
    const xCryptoKey_js_1 = require("../../xCryptoKey.js");
    /**
     * Base DhkemPrimitives implementation for Montgomery curves (X25519/X448).
     *
     * Subclasses pass curve-specific parameters (algorithm name, key size, curve)
     * and optionally add extra methods (e.g., raw derive for X25519).
     */
    class XCurveDhkemPrimitives {
        constructor(algName, keySize, curve, hkdf) {
            Object.defineProperty(this, "_algName", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_curve", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_hkdf", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_nPk", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_nSk", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this._algName = algName;
            this._nPk = keySize;
            this._nSk = keySize;
            this._curve = curve;
            this._hkdf = hkdf;
        }
        serializePublicKey(key) {
            try {
                return Promise.resolve(key.key.buffer);
            }
            catch (e) {
                return Promise.reject(new errors_js_1.SerializeError(e));
            }
        }
        async deserializePublicKey(key) {
            try {
                return await this._importRawKey((0, hkdf_js_1.toArrayBuffer)(key), true);
            }
            catch (e) {
                throw new errors_js_1.DeserializeError(e);
            }
        }
        serializePrivateKey(key) {
            try {
                return Promise.resolve(key.key.buffer);
            }
            catch (e) {
                return Promise.reject(new errors_js_1.SerializeError(e));
            }
        }
        async deserializePrivateKey(key) {
            try {
                return await this._importRawKey((0, hkdf_js_1.toArrayBuffer)(key), false);
            }
            catch (e) {
                throw new errors_js_1.DeserializeError(e);
            }
        }
        async importKey(format, key, isPublic) {
            try {
                if (format === "raw") {
                    return await this._importRawKey(key, isPublic);
                }
                // jwk
                if (key instanceof ArrayBuffer) {
                    throw new Error("Invalid jwk key format");
                }
                return await this._importJWK(key, isPublic);
            }
            catch (e) {
                throw new errors_js_1.DeserializeError(e);
            }
        }
        async generateKeyPair() {
            try {
                const rawSk = await this._curve.utils.randomSecretKey();
                const sk = new xCryptoKey_js_1.XCryptoKey(this._algName, rawSk, "private", dhkemPrimitives_js_1.KEM_USAGES);
                const pk = await this.derivePublicKey(sk);
                return { publicKey: pk, privateKey: sk };
            }
            catch (e) {
                throw new errors_js_1.NotSupportedError(e);
            }
        }
        async deriveKeyPair(ikm) {
            try {
                const rawIkm = (0, hkdf_js_1.toArrayBuffer)(ikm);
                const dkpPrk = await this._hkdf.labeledExtract(consts_js_1.EMPTY.buffer, dhkemPrimitives_js_1.LABEL_DKP_PRK, new Uint8Array(rawIkm));
                const rawSk = await this._hkdf.labeledExpand(dkpPrk, dhkemPrimitives_js_1.LABEL_SK, consts_js_1.EMPTY, this._nSk);
                const sk = new xCryptoKey_js_1.XCryptoKey(this._algName, new Uint8Array(rawSk), "private", dhkemPrimitives_js_1.KEM_USAGES);
                return {
                    privateKey: sk,
                    publicKey: await this.derivePublicKey(sk),
                };
            }
            catch (e) {
                throw new errors_js_1.DeriveKeyPairError(e);
            }
        }
        derivePublicKey(key) {
            try {
                const pk = this._curve.getPublicKey(key.key);
                return Promise.resolve(new xCryptoKey_js_1.XCryptoKey(this._algName, pk, "public"));
            }
            catch (e) {
                return Promise.reject(new errors_js_1.DeserializeError(e));
            }
        }
        dh(sk, pk) {
            try {
                return Promise.resolve(this._curve.getSharedSecret(sk.key, pk.key).buffer);
            }
            catch (e) {
                return Promise.reject(new errors_js_1.SerializeError(e));
            }
        }
        _importRawKey(key, isPublic) {
            return new Promise((resolve, reject) => {
                if (isPublic && key.byteLength !== this._nPk) {
                    reject(new Error("Invalid length of the key"));
                }
                if (!isPublic && key.byteLength !== this._nSk) {
                    reject(new Error("Invalid length of the key"));
                }
                resolve(new xCryptoKey_js_1.XCryptoKey(this._algName, new Uint8Array(key), isPublic ? "public" : "private", isPublic ? [] : dhkemPrimitives_js_1.KEM_USAGES));
            });
        }
        _importJWK(key, isPublic) {
            return new Promise((resolve, reject) => {
                if (key.kty !== "OKP") {
                    reject(new Error(`Invalid kty: ${key.kty}`));
                }
                if (key.crv !== this._algName) {
                    reject(new Error(`Invalid crv: ${key.crv}`));
                }
                if (isPublic) {
                    if (typeof key.d !== "undefined") {
                        reject(new Error("Invalid key: `d` should not be set"));
                    }
                    if (typeof key.x !== "string") {
                        reject(new Error("Invalid key: `x` not found"));
                    }
                    resolve(new xCryptoKey_js_1.XCryptoKey(this._algName, (0, misc_js_1.base64UrlToBytes)(key.x), "public"));
                }
                else {
                    if (typeof key.d !== "string") {
                        reject(new Error("Invalid key: `d` not found"));
                    }
                    resolve(new xCryptoKey_js_1.XCryptoKey(this._algName, (0, misc_js_1.base64UrlToBytes)(key.d), "private", dhkemPrimitives_js_1.KEM_USAGES));
                }
            });
        }
    }
    exports.XCurveDhkemPrimitives = XCurveDhkemPrimitives;
});

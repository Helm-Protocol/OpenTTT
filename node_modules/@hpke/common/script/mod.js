var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./src/errors.js", "./src/algorithm.js", "./src/identifiers.js", "./src/kems/dhkem.js", "./src/kems/dhkemPrimitives/ec.js", "./src/kems/dhkemPrimitives/xCurve.js", "./src/kems/hybridkem.js", "./src/xCryptoKey.js", "./src/kdfs/hkdf.js", "./src/interfaces/aeadEncryptionContext.js", "./src/interfaces/dhkemPrimitives.js", "./src/interfaces/dhkemPrimitives.js", "./src/interfaces/kemInterface.js", "./src/consts.js", "./src/utils/misc.js", "./src/utils/noble.js", "./src/hash/hmac.js", "./src/hash/sha2.js", "./src/hash/sha3.js", "./src/curve/modular.js", "./src/curve/montgomery.js"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.montgomery = exports.pow2 = exports.mod = exports.shake256 = exports.shake128 = exports.sha3_512 = exports.sha3_384 = exports.sha3_256 = exports.sha512 = exports.sha384 = exports.sha256 = exports.hmac = exports.u32 = exports.numberToBigint = exports.isLE = exports.hexToNumber = exports.createView = exports.copyBytes = exports.clean = exports.aoutput = exports.anumber = exports.aexists = exports.abytes = exports.xor = exports.loadSubtleCrypto = exports.loadCrypto = exports.kemToKeyGenAlgorithm = exports.isDenoV1 = exports.isDeno = exports.isCryptoKeyPair = exports.i2Osp = exports.hexToBytes = exports.concat = exports.base64UrlToBytes = exports.MINIMUM_PSK_LENGTH = exports.INPUT_LENGTH_LIMIT = exports.INFO_LENGTH_LIMIT = exports.EMPTY = exports.SUITE_ID_HEADER_KEM = exports.LABEL_SK = exports.LABEL_DKP_PRK = exports.KEM_USAGES = exports.AEAD_USAGES = exports.toUint8Array = exports.toArrayBuffer = exports.HkdfSha512Native = exports.HkdfSha384Native = exports.HkdfSha256Native = exports.XCryptoKey = exports.Hybridkem = exports.XCurveDhkemPrimitives = exports.Ec = exports.Dhkem = exports.Mode = exports.KemId = exports.KdfId = exports.AeadId = exports.NativeAlgorithm = void 0;
    __exportStar(require("./src/errors.js"), exports);
    var algorithm_js_1 = require("./src/algorithm.js");
    Object.defineProperty(exports, "NativeAlgorithm", { enumerable: true, get: function () { return algorithm_js_1.NativeAlgorithm; } });
    var identifiers_js_1 = require("./src/identifiers.js");
    Object.defineProperty(exports, "AeadId", { enumerable: true, get: function () { return identifiers_js_1.AeadId; } });
    Object.defineProperty(exports, "KdfId", { enumerable: true, get: function () { return identifiers_js_1.KdfId; } });
    Object.defineProperty(exports, "KemId", { enumerable: true, get: function () { return identifiers_js_1.KemId; } });
    Object.defineProperty(exports, "Mode", { enumerable: true, get: function () { return identifiers_js_1.Mode; } });
    var dhkem_js_1 = require("./src/kems/dhkem.js");
    Object.defineProperty(exports, "Dhkem", { enumerable: true, get: function () { return dhkem_js_1.Dhkem; } });
    var ec_js_1 = require("./src/kems/dhkemPrimitives/ec.js");
    Object.defineProperty(exports, "Ec", { enumerable: true, get: function () { return ec_js_1.Ec; } });
    var xCurve_js_1 = require("./src/kems/dhkemPrimitives/xCurve.js");
    Object.defineProperty(exports, "XCurveDhkemPrimitives", { enumerable: true, get: function () { return xCurve_js_1.XCurveDhkemPrimitives; } });
    var hybridkem_js_1 = require("./src/kems/hybridkem.js");
    Object.defineProperty(exports, "Hybridkem", { enumerable: true, get: function () { return hybridkem_js_1.Hybridkem; } });
    var xCryptoKey_js_1 = require("./src/xCryptoKey.js");
    Object.defineProperty(exports, "XCryptoKey", { enumerable: true, get: function () { return xCryptoKey_js_1.XCryptoKey; } });
    var hkdf_js_1 = require("./src/kdfs/hkdf.js");
    Object.defineProperty(exports, "HkdfSha256Native", { enumerable: true, get: function () { return hkdf_js_1.HkdfSha256Native; } });
    Object.defineProperty(exports, "HkdfSha384Native", { enumerable: true, get: function () { return hkdf_js_1.HkdfSha384Native; } });
    Object.defineProperty(exports, "HkdfSha512Native", { enumerable: true, get: function () { return hkdf_js_1.HkdfSha512Native; } });
    Object.defineProperty(exports, "toArrayBuffer", { enumerable: true, get: function () { return hkdf_js_1.toArrayBuffer; } });
    Object.defineProperty(exports, "toUint8Array", { enumerable: true, get: function () { return hkdf_js_1.toUint8Array; } });
    var aeadEncryptionContext_js_1 = require("./src/interfaces/aeadEncryptionContext.js");
    Object.defineProperty(exports, "AEAD_USAGES", { enumerable: true, get: function () { return aeadEncryptionContext_js_1.AEAD_USAGES; } });
    var dhkemPrimitives_js_1 = require("./src/interfaces/dhkemPrimitives.js");
    Object.defineProperty(exports, "KEM_USAGES", { enumerable: true, get: function () { return dhkemPrimitives_js_1.KEM_USAGES; } });
    var dhkemPrimitives_js_2 = require("./src/interfaces/dhkemPrimitives.js");
    Object.defineProperty(exports, "LABEL_DKP_PRK", { enumerable: true, get: function () { return dhkemPrimitives_js_2.LABEL_DKP_PRK; } });
    Object.defineProperty(exports, "LABEL_SK", { enumerable: true, get: function () { return dhkemPrimitives_js_2.LABEL_SK; } });
    var kemInterface_js_1 = require("./src/interfaces/kemInterface.js");
    Object.defineProperty(exports, "SUITE_ID_HEADER_KEM", { enumerable: true, get: function () { return kemInterface_js_1.SUITE_ID_HEADER_KEM; } });
    var consts_js_1 = require("./src/consts.js");
    Object.defineProperty(exports, "EMPTY", { enumerable: true, get: function () { return consts_js_1.EMPTY; } });
    Object.defineProperty(exports, "INFO_LENGTH_LIMIT", { enumerable: true, get: function () { return consts_js_1.INFO_LENGTH_LIMIT; } });
    Object.defineProperty(exports, "INPUT_LENGTH_LIMIT", { enumerable: true, get: function () { return consts_js_1.INPUT_LENGTH_LIMIT; } });
    Object.defineProperty(exports, "MINIMUM_PSK_LENGTH", { enumerable: true, get: function () { return consts_js_1.MINIMUM_PSK_LENGTH; } });
    var misc_js_1 = require("./src/utils/misc.js");
    Object.defineProperty(exports, "base64UrlToBytes", { enumerable: true, get: function () { return misc_js_1.base64UrlToBytes; } });
    Object.defineProperty(exports, "concat", { enumerable: true, get: function () { return misc_js_1.concat; } });
    Object.defineProperty(exports, "hexToBytes", { enumerable: true, get: function () { return misc_js_1.hexToBytes; } });
    Object.defineProperty(exports, "i2Osp", { enumerable: true, get: function () { return misc_js_1.i2Osp; } });
    Object.defineProperty(exports, "isCryptoKeyPair", { enumerable: true, get: function () { return misc_js_1.isCryptoKeyPair; } });
    Object.defineProperty(exports, "isDeno", { enumerable: true, get: function () { return misc_js_1.isDeno; } });
    Object.defineProperty(exports, "isDenoV1", { enumerable: true, get: function () { return misc_js_1.isDenoV1; } });
    Object.defineProperty(exports, "kemToKeyGenAlgorithm", { enumerable: true, get: function () { return misc_js_1.kemToKeyGenAlgorithm; } });
    Object.defineProperty(exports, "loadCrypto", { enumerable: true, get: function () { return misc_js_1.loadCrypto; } });
    Object.defineProperty(exports, "loadSubtleCrypto", { enumerable: true, get: function () { return misc_js_1.loadSubtleCrypto; } });
    Object.defineProperty(exports, "xor", { enumerable: true, get: function () { return misc_js_1.xor; } });
    var noble_js_1 = require("./src/utils/noble.js");
    Object.defineProperty(exports, "abytes", { enumerable: true, get: function () { return noble_js_1.abytes; } });
    Object.defineProperty(exports, "aexists", { enumerable: true, get: function () { return noble_js_1.aexists; } });
    Object.defineProperty(exports, "anumber", { enumerable: true, get: function () { return noble_js_1.anumber; } });
    Object.defineProperty(exports, "aoutput", { enumerable: true, get: function () { return noble_js_1.aoutput; } });
    Object.defineProperty(exports, "clean", { enumerable: true, get: function () { return noble_js_1.clean; } });
    Object.defineProperty(exports, "copyBytes", { enumerable: true, get: function () { return noble_js_1.copyBytes; } });
    Object.defineProperty(exports, "createView", { enumerable: true, get: function () { return noble_js_1.createView; } });
    Object.defineProperty(exports, "hexToNumber", { enumerable: true, get: function () { return noble_js_1.hexToNumber; } });
    Object.defineProperty(exports, "isLE", { enumerable: true, get: function () { return noble_js_1.isLE; } });
    Object.defineProperty(exports, "numberToBigint", { enumerable: true, get: function () { return noble_js_1.numberToBigint; } });
    Object.defineProperty(exports, "u32", { enumerable: true, get: function () { return noble_js_1.u32; } });
    var hmac_js_1 = require("./src/hash/hmac.js");
    Object.defineProperty(exports, "hmac", { enumerable: true, get: function () { return hmac_js_1.hmac; } });
    var sha2_js_1 = require("./src/hash/sha2.js");
    Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return sha2_js_1.sha256; } });
    Object.defineProperty(exports, "sha384", { enumerable: true, get: function () { return sha2_js_1.sha384; } });
    Object.defineProperty(exports, "sha512", { enumerable: true, get: function () { return sha2_js_1.sha512; } });
    var sha3_js_1 = require("./src/hash/sha3.js");
    Object.defineProperty(exports, "sha3_256", { enumerable: true, get: function () { return sha3_js_1.sha3_256; } });
    Object.defineProperty(exports, "sha3_384", { enumerable: true, get: function () { return sha3_js_1.sha3_384; } });
    Object.defineProperty(exports, "sha3_512", { enumerable: true, get: function () { return sha3_js_1.sha3_512; } });
    Object.defineProperty(exports, "shake128", { enumerable: true, get: function () { return sha3_js_1.shake128; } });
    Object.defineProperty(exports, "shake256", { enumerable: true, get: function () { return sha3_js_1.shake256; } });
    var modular_js_1 = require("./src/curve/modular.js");
    Object.defineProperty(exports, "mod", { enumerable: true, get: function () { return modular_js_1.mod; } });
    Object.defineProperty(exports, "pow2", { enumerable: true, get: function () { return modular_js_1.pow2; } });
    var montgomery_js_1 = require("./src/curve/montgomery.js");
    Object.defineProperty(exports, "montgomery", { enumerable: true, get: function () { return montgomery_js_1.montgomery; } });
});

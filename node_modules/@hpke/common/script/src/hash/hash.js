/**
 * This file is based on noble-curves (https://github.com/paulmillr/noble-curves).
 *
 * noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com)
 *
 * The original file is located at:
 * https://github.com/paulmillr/noble-curves/blob/b9d49d2b41d550571a0c5be443ecb62109fa3373/src/utils.ts
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "../utils/noble.js"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ahash = ahash;
    exports.createHasher = createHasher;
    /**
     * Hash utilities and type definitions extracted from noble.ts
     * @module
     */
    const noble_js_1 = require("../utils/noble.js");
    /** Asserts something is hash */
    function ahash(h) {
        if (typeof h !== "function" || typeof h.create !== "function") {
            throw new Error("Hash must wrapped by utils.createHasher");
        }
        (0, noble_js_1.anumber)(h.outputLen);
        (0, noble_js_1.anumber)(h.blockLen);
    }
    function createHasher(hashCons, info = {}) {
        const hashFn = (msg, opts) => hashCons(opts).update(msg).digest();
        const tmp = hashCons(undefined);
        const hashC = Object.assign(hashFn, {
            outputLen: tmp.outputLen,
            blockLen: tmp.blockLen,
            create: (opts) => hashCons(opts),
            ...info,
        });
        return Object.freeze(hashC);
    }
});

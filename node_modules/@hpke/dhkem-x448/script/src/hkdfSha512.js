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
    exports.HkdfSha512 = void 0;
    const common_1 = require("@hpke/common");
    class HkdfSha512 extends common_1.HkdfSha512Native {
        async extract(salt, ikm) {
            await this._setup();
            const saltBuf = salt.byteLength === 0
                ? new ArrayBuffer(this.hashSize)
                : (0, common_1.toArrayBuffer)(salt);
            const ikmBuf = (0, common_1.toArrayBuffer)(ikm);
            if (saltBuf.byteLength !== this.hashSize) {
                return (0, common_1.hmac)(common_1.sha512, new Uint8Array(saltBuf), new Uint8Array(ikmBuf))
                    .buffer;
            }
            const key = await this._api.importKey("raw", saltBuf, this.algHash, false, [
                "sign",
            ]);
            return await this._api.sign("HMAC", key, ikmBuf);
        }
    }
    exports.HkdfSha512 = HkdfSha512;
});

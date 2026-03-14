import { HkdfSha256Native, hmac, sha256, toArrayBuffer } from "@hpke/common";
export class HkdfSha256 extends HkdfSha256Native {
    async extract(salt, ikm) {
        await this._setup();
        const saltBuf = salt.byteLength === 0
            ? new ArrayBuffer(this.hashSize)
            : toArrayBuffer(salt);
        const ikmBuf = toArrayBuffer(ikm);
        if (saltBuf.byteLength !== this.hashSize) {
            return hmac(sha256, new Uint8Array(saltBuf), new Uint8Array(ikmBuf))
                .buffer;
        }
        const key = await this._api.importKey("raw", saltBuf, this.algHash, false, [
            "sign",
        ]);
        return await this._api.sign("HMAC", key, ikmBuf);
    }
}

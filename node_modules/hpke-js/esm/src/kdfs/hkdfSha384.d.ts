import { HkdfSha384Native } from "@hpke/common";
export declare class HkdfSha384 extends HkdfSha384Native {
    extract(salt: ArrayBufferLike | ArrayBufferView, ikm: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer>;
}
//# sourceMappingURL=hkdfSha384.d.ts.map
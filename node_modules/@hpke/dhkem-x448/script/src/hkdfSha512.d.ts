import { HkdfSha512Native } from "@hpke/common";
export declare class HkdfSha512 extends HkdfSha512Native {
    extract(salt: ArrayBufferLike | ArrayBufferView, ikm: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer>;
}
//# sourceMappingURL=hkdfSha512.d.ts.map
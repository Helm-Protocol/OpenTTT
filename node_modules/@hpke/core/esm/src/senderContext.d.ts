import type { KdfInterface } from "@hpke/common";
import type { AeadParams } from "./interfaces/aeadParams.js";
import type { Encapsulator } from "./interfaces/encapsulator.js";
import { EncryptionContextImpl } from "./encryptionContext.js";
export declare class SenderContextImpl extends EncryptionContextImpl implements Encapsulator {
    #private;
    readonly enc: ArrayBuffer;
    constructor(api: SubtleCrypto, kdf: KdfInterface, params: AeadParams, enc: ArrayBuffer);
    seal(data: ArrayBufferLike | ArrayBufferView, aad?: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer>;
}
//# sourceMappingURL=senderContext.d.ts.map
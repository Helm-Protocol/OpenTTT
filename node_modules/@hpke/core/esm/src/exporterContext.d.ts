import type { KdfInterface } from "@hpke/common";
import type { Encapsulator } from "./interfaces/encapsulator.js";
import type { EncryptionContext } from "./interfaces/encryptionContext.js";
export declare class ExporterContextImpl implements EncryptionContext {
    protected _api: SubtleCrypto;
    protected readonly exporterSecret: ArrayBuffer;
    private _kdf;
    constructor(api: SubtleCrypto, kdf: KdfInterface, exporterSecret: ArrayBuffer);
    seal(_data: ArrayBufferLike | ArrayBufferView, _aad: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer>;
    open(_data: ArrayBufferLike | ArrayBufferView, _aad: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer>;
    export(exporterContext: ArrayBufferLike | ArrayBufferView, len: number): Promise<ArrayBuffer>;
}
export declare class RecipientExporterContextImpl extends ExporterContextImpl {
}
export declare class SenderExporterContextImpl extends ExporterContextImpl implements Encapsulator {
    readonly enc: ArrayBuffer;
    constructor(api: SubtleCrypto, kdf: KdfInterface, exporterSecret: ArrayBuffer, enc: ArrayBuffer);
}
//# sourceMappingURL=exporterContext.d.ts.map
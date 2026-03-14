import type { EmbeddedAPIKey } from "./models";
import type { Session } from "@turnkey/sdk-types";
export declare const createEmbeddedAPIKey: (targetPublicKey: string) => Promise<EmbeddedAPIKey>;
export declare const generateRandomBuffer: () => ArrayBuffer;
export declare const base64UrlEncode: (challenge: ArrayBuffer) => string;
export declare const bytesToHex: (bytes: Uint8Array) => string;
export declare function parseSession(token: string | Session): Session;
//# sourceMappingURL=utils.d.ts.map
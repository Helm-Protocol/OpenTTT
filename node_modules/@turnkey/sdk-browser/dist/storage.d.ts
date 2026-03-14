import type { Session } from "@turnkey/sdk-types";
import type { AuthClient } from "./__types__/base";
export declare enum StorageKeys {
    Session = "@turnkey/session/v2",
    Client = "@turnkey/client"
}
interface StorageValue {
    [StorageKeys.Session]: string | Session;
    [StorageKeys.Client]: AuthClient;
}
export declare const getStorageValue: <K extends StorageKeys>(storageKey: K) => Promise<StorageValue[K] | undefined>;
export declare const setStorageValue: <K extends StorageKeys>(storageKey: K, storageValue: StorageValue[K]) => Promise<any>;
export declare const removeStorageValue: <K extends StorageKeys>(storageKey: K) => Promise<void>;
/**
 * Saves a session and client to storage.
 *
 * @param {Session} session - The session response containing session details.
 * @param {AuthClient} authClient - The authentication client used for the session.
 * @throws Will throw an error if the authentication client is not set.
 * @returns {Promise<void>} A promise that resolves when the session is saved.
 */
export declare const storeSession: (session: string | Session, client?: AuthClient) => Promise<void>;
export {};
//# sourceMappingURL=storage.d.ts.map
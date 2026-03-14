import { WalletStamper } from '@turnkey/wallet-stamper';
import { IframeStamper } from '@turnkey/iframe-stamper';
import { WebauthnStamper } from '@turnkey/webauthn-stamper';
import WindowWrapper from './__polyfills__/window.mjs';
import { TurnkeyRequestError } from './__types__/base.mjs';
import { getStorageValue, StorageKeys, removeStorageValue } from './storage.mjs';
import { TurnkeyPasskeyClient, TurnkeyIframeClient, TurnkeyWalletClient, TurnkeyIndexedDbClient } from './__clients__/browser-clients.mjs';
export { TurnkeyBrowserClient } from './__clients__/browser-clients.mjs';
import { VERSION } from './__generated__/version.mjs';
import { IndexedDbStamper } from '@turnkey/indexed-db-stamper';
import { parseSession } from './utils.mjs';

class TurnkeyBrowserSDK {
    constructor(config) {
        /**
         * Creates a passkey client. The parameters override the default values passed to the underlying Turnkey `WebauthnStamper`
         * @param PasskeyClientParams
         * @returns new TurnkeyPasskeyClient
         */
        this.passkeyClient = (params) => {
            const targetRpId = params?.rpId ?? this.config.rpId ?? WindowWrapper.location.hostname;
            if (!targetRpId) {
                throw new Error("Tried to initialize a passkey client with no rpId defined");
            }
            this.stamper = new WebauthnStamper({
                rpId: targetRpId,
                ...(params?.timeout !== undefined && { timeout: params?.timeout }),
                ...(params?.userVerification !== undefined && {
                    userVerification: params?.userVerification,
                }),
                ...(params?.allowCredentials !== undefined && {
                    allowCredentials: params?.allowCredentials,
                }),
            });
            return new TurnkeyPasskeyClient({
                stamper: this.stamper,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.iframeClient = async (params) => {
            if (!params.iframeUrl) {
                throw new Error("Tried to initialize iframeClient with no iframeUrl defined");
            }
            const TurnkeyIframeElementId = params.iframeElementId ?? "turnkey-default-iframe-element-id";
            this.stamper = new IframeStamper({
                iframeContainer: params.iframeContainer,
                iframeUrl: params.iframeUrl,
                iframeElementId: TurnkeyIframeElementId,
            });
            await this.stamper.init(params.dangerouslyOverrideIframeKeyTtl ?? undefined);
            return new TurnkeyIframeClient({
                stamper: this.stamper,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.walletClient = (wallet) => {
            return new TurnkeyWalletClient({
                stamper: new WalletStamper(wallet),
                wallet,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.indexedDbClient = async () => {
            this.stamper = new IndexedDbStamper();
            return new TurnkeyIndexedDbClient({
                stamper: this.stamper,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.serverSign = async (methodName, params, serverSignUrl) => {
            const targetServerSignUrl = serverSignUrl ?? this.config.serverSignUrl;
            if (!targetServerSignUrl) {
                throw new Error("Tried to call serverSign with no serverSignUrl defined");
            }
            const stringifiedBody = JSON.stringify({
                methodName: methodName,
                params: params,
            });
            const response = await fetch(targetServerSignUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Client-Version": VERSION,
                },
                body: stringifiedBody,
                redirect: "follow",
            });
            if (!response.ok) {
                let res;
                try {
                    res = await response.json();
                }
                catch (_) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }
                throw new TurnkeyRequestError(res);
            }
            const data = await response.json();
            return data;
        };
        /**
         * If there is a valid, active session, this will parse it and return it
         *
         * @returns {Promise<Session | undefined>}
         */
        this.getSession = async () => {
            const currentSession = await getStorageValue(StorageKeys.Session);
            let session;
            if (typeof currentSession === "string") {
                session = parseSession(currentSession);
            }
            else {
                session = currentSession;
            }
            if (session && session.expiry * 1000 > Date.now()) {
                return session;
            }
            await removeStorageValue(StorageKeys.Session);
            return undefined;
        };
        /**
         * If there is a valid, active session, this will return it without parsing it
         *
         * @returns {Promise<Session | undefined>}
         */
        this.getRawSession = async () => {
            const currentSession = await getStorageValue(StorageKeys.Session);
            let session;
            if (typeof currentSession === "string") {
                session = parseSession(currentSession);
                if (session && session.expiry * 1000 > Date.now()) {
                    return currentSession; // return raw JWT string
                }
            }
            else if (currentSession && currentSession.expiry * 1000 > Date.now()) {
                return JSON.stringify(currentSession);
            }
            await removeStorageValue(StorageKeys.Session);
            return undefined;
        };
        /**
         * Clears out all data pertaining to an end user session.
         *
         * @returns {Promise<boolean>}
         */
        this.logout = async () => {
            await removeStorageValue(StorageKeys.Client);
            await removeStorageValue(StorageKeys.Session);
            return true;
        };
        this.config = config;
    }
}

export { TurnkeyBrowserSDK, TurnkeyIframeClient, TurnkeyIndexedDbClient, TurnkeyPasskeyClient, TurnkeyWalletClient };
//# sourceMappingURL=sdk-client.mjs.map

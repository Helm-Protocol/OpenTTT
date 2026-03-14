'use strict';

var walletStamper = require('@turnkey/wallet-stamper');
var iframeStamper = require('@turnkey/iframe-stamper');
var webauthnStamper = require('@turnkey/webauthn-stamper');
var window = require('./__polyfills__/window.js');
var base = require('./__types__/base.js');
var storage = require('./storage.js');
var browserClients = require('./__clients__/browser-clients.js');
var version = require('./__generated__/version.js');
var indexedDbStamper = require('@turnkey/indexed-db-stamper');
var utils = require('./utils.js');

class TurnkeyBrowserSDK {
    constructor(config) {
        /**
         * Creates a passkey client. The parameters override the default values passed to the underlying Turnkey `WebauthnStamper`
         * @param PasskeyClientParams
         * @returns new TurnkeyPasskeyClient
         */
        this.passkeyClient = (params) => {
            const targetRpId = params?.rpId ?? this.config.rpId ?? window.location.hostname;
            if (!targetRpId) {
                throw new Error("Tried to initialize a passkey client with no rpId defined");
            }
            this.stamper = new webauthnStamper.WebauthnStamper({
                rpId: targetRpId,
                ...(params?.timeout !== undefined && { timeout: params?.timeout }),
                ...(params?.userVerification !== undefined && {
                    userVerification: params?.userVerification,
                }),
                ...(params?.allowCredentials !== undefined && {
                    allowCredentials: params?.allowCredentials,
                }),
            });
            return new browserClients.TurnkeyPasskeyClient({
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
            this.stamper = new iframeStamper.IframeStamper({
                iframeContainer: params.iframeContainer,
                iframeUrl: params.iframeUrl,
                iframeElementId: TurnkeyIframeElementId,
            });
            await this.stamper.init(params.dangerouslyOverrideIframeKeyTtl ?? undefined);
            return new browserClients.TurnkeyIframeClient({
                stamper: this.stamper,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.walletClient = (wallet) => {
            return new browserClients.TurnkeyWalletClient({
                stamper: new walletStamper.WalletStamper(wallet),
                wallet,
                apiBaseUrl: this.config.apiBaseUrl,
                organizationId: this.config.defaultOrganizationId,
            });
        };
        this.indexedDbClient = async () => {
            this.stamper = new indexedDbStamper.IndexedDbStamper();
            return new browserClients.TurnkeyIndexedDbClient({
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
                    "X-Client-Version": version.VERSION,
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
                throw new base.TurnkeyRequestError(res);
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
            const currentSession = await storage.getStorageValue(storage.StorageKeys.Session);
            let session;
            if (typeof currentSession === "string") {
                session = utils.parseSession(currentSession);
            }
            else {
                session = currentSession;
            }
            if (session && session.expiry * 1000 > Date.now()) {
                return session;
            }
            await storage.removeStorageValue(storage.StorageKeys.Session);
            return undefined;
        };
        /**
         * If there is a valid, active session, this will return it without parsing it
         *
         * @returns {Promise<Session | undefined>}
         */
        this.getRawSession = async () => {
            const currentSession = await storage.getStorageValue(storage.StorageKeys.Session);
            let session;
            if (typeof currentSession === "string") {
                session = utils.parseSession(currentSession);
                if (session && session.expiry * 1000 > Date.now()) {
                    return currentSession; // return raw JWT string
                }
            }
            else if (currentSession && currentSession.expiry * 1000 > Date.now()) {
                return JSON.stringify(currentSession);
            }
            await storage.removeStorageValue(storage.StorageKeys.Session);
            return undefined;
        };
        /**
         * Clears out all data pertaining to an end user session.
         *
         * @returns {Promise<boolean>}
         */
        this.logout = async () => {
            await storage.removeStorageValue(storage.StorageKeys.Client);
            await storage.removeStorageValue(storage.StorageKeys.Session);
            return true;
        };
        this.config = config;
    }
}

exports.TurnkeyBrowserClient = browserClients.TurnkeyBrowserClient;
exports.TurnkeyIframeClient = browserClients.TurnkeyIframeClient;
exports.TurnkeyIndexedDbClient = browserClients.TurnkeyIndexedDbClient;
exports.TurnkeyPasskeyClient = browserClients.TurnkeyPasskeyClient;
exports.TurnkeyWalletClient = browserClients.TurnkeyWalletClient;
exports.TurnkeyBrowserSDK = TurnkeyBrowserSDK;
//# sourceMappingURL=sdk-client.js.map

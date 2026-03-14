'use strict';

var http = require('@turnkey/http');
var sdkTypes = require('@turnkey/sdk-types');
var baseClient = require('./base-client.js');
var base = require('../__types__/base.js');
var utils = require('../utils.js');
var storage = require('../storage.js');
var constants = require('../constants.js');
var encoding = require('@turnkey/encoding');

class TurnkeyBrowserClient extends baseClient.TurnkeyBaseClient {
    constructor(config, authClient) {
        super(config, authClient);
        /**
         * @deprecated
         * This method is deprecated and only creates a READ_ONLY session using an API key.
         * Use one of the following methods instead, depending on your context:
         *
         * - `loginWithPasskey()` for WebAuthn-based sessions using IndexedDB
         * - `loginWithWallet()` for EVM or Solana wallet-based sessions
         * - `loginWithSession()` if the session string is already available (e.g. from server actions)
         * - `loginWithBundle()` for iframe-based sessions (e.g. for email-auth non otp based login)
         *
         * @param config Optional configuration containing an organization ID
         * @returns A Promise resolving to the created read-only session
         */
        this.login = async (config) => {
            const readOnlySessionResult = await this.createReadOnlySession(config || {});
            const session = {
                sessionType: sdkTypes.SessionType.READ_ONLY,
                userId: readOnlySessionResult.userId,
                organizationId: readOnlySessionResult.organizationId,
                expiry: Number(readOnlySessionResult.sessionExpiry),
                token: readOnlySessionResult.session,
            };
            await storage.storeSession(session, this.authClient);
            return readOnlySessionResult;
        };
        /**
         * Attempts to refresh an existing Session. This method infers the current user's organization ID and target userId.
         *
         * - For `READ_ONLY` sessions: Requires the client to be a `TurnkeyPasskeyClient`.
         * - For `READ_WRITE` sessions:
         *   - If the client is a `TurnkeyIndexedDbClient`, a new keypair will be generated unless a `publicKey` is provided.
         *   - If the client is a `TurnkeyIframeClient`, it will use the provided `publicKey` if available, or fall back to `getEmbeddedPublicKey()`.
         *     If no key is available from either source, an error will be thrown.
         *
         * @param RefreshSessionParams
         *   @param params.sessionType - The type of session being refreshed. Defaults to `READ_WRITE`.
         *   @param params.expirationSeconds - How long to extend the session for, in seconds. Defaults to 900 (15 minutes).
         *   @param params.invalidateExisting - Whether to invalidate existing sessions. Defaults to `false`.
         *   @param params.publicKey - Optional public key to use for session creation. If not provided, each client type has fallback behavior.
         * @returns {Promise<void>}
         */
        this.refreshSession = async ({ sessionType = sdkTypes.SessionType.READ_WRITE, expirationSeconds = constants.DEFAULT_SESSION_EXPIRATION_IN_SECONDS, invalidateExisting = false, publicKey, } = {}) => {
            try {
                switch (sessionType) {
                    case sdkTypes.SessionType.READ_ONLY: {
                        if (!(this instanceof TurnkeyPasskeyClient)) {
                            throw new Error("You must use a passkey client to refresh a read-only session.");
                        }
                        const result = await this.createReadOnlySession({});
                        const session = {
                            sessionType: sdkTypes.SessionType.READ_ONLY,
                            userId: result.userId,
                            organizationId: result.organizationId,
                            expiry: Number(result.sessionExpiry),
                            token: result.session,
                        };
                        await storage.storeSession(session, base.AuthClient.Passkey);
                        return;
                    }
                    case sdkTypes.SessionType.READ_WRITE: {
                        // function was called with an IndexedDbClient
                        if (this instanceof TurnkeyIndexedDbClient) {
                            let keyPair = undefined;
                            let compressedHex = publicKey;
                            if (!publicKey) {
                                keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
                                const rawPubKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
                                compressedHex = encoding.uint8ArrayToHexString(encoding.pointEncode(rawPubKey));
                            }
                            const result = await this.stampLogin({
                                publicKey: compressedHex,
                                expirationSeconds,
                                invalidateExisting,
                            });
                            await this.resetKeyPair(keyPair);
                            await storage.storeSession(result.session, base.AuthClient.IndexedDb);
                            return;
                        }
                        // function was called with an IframeClient
                        if (this instanceof TurnkeyIframeClient) {
                            const targetPublicKey = publicKey ?? (await this.getEmbeddedPublicKey());
                            if (!targetPublicKey) {
                                throw new Error("Unable to refresh session: missing target public key.");
                            }
                            const result = await this.createReadWriteSession({
                                targetPublicKey,
                                expirationSeconds,
                                invalidateExisting,
                            });
                            const session = {
                                sessionType: sdkTypes.SessionType.READ_WRITE,
                                userId: result.userId,
                                organizationId: result.organizationId,
                                expiry: Date.now() + Number(expirationSeconds) * 1000,
                                token: result.credentialBundle,
                            };
                            await this.injectCredentialBundle(session.token);
                            await storage.storeSession(session, base.AuthClient.Iframe);
                            return;
                        }
                        throw new Error("Unsupported client type for read-write session refresh.");
                    }
                    default:
                        throw new Error(`Invalid session type passed: ${sessionType}`);
                }
            }
            catch (error) {
                throw new Error(`Unable to refresh session: ${error}`);
            }
        };
        /**
         * Log in with a bundle. This method uses a bundle sent to the end user email
         * To be used in conjunction with an `iframeStamper`.
         *
         * @param LoginWithBundleParams
         *   @param params.bundle - Credential bundle to log in with
         *   @param params.expirationSeconds - Expiration time for the session in seconds. Defaults to 900 seconds or 15 minutes.
         * @returns {Promise<void>}
         */
        this.loginWithBundle = async (params) => {
            const { bundle, expirationSeconds = constants.DEFAULT_SESSION_EXPIRATION_IN_SECONDS, } = params;
            if (this instanceof TurnkeyIframeClient) {
                await this.injectCredentialBundle(bundle);
            }
            else {
                // Throw an error if the client is not an iframe client
                throw new Error("You must use an iframe client to log in with a session."); //should we default to a "localStorage" client?
            }
            const whoAmI = await this.getWhoami();
            const session = {
                sessionType: sdkTypes.SessionType.READ_WRITE,
                userId: whoAmI.userId,
                organizationId: whoAmI.organizationId,
                expiry: Date.now() + Number(expirationSeconds) * 1000,
                token: bundle,
            };
            await storage.storeSession(session, base.AuthClient.Iframe);
        };
        /**
         * Log in with a session returns from Turnkey. This method uses a session from server actions and stores it and the active client in local storage
         * To be used in conjunction with an `indexeDbStamper`.
         *
         * @param session
         * @returns {Promise<void>}
         */
        this.loginWithSession = async (session) => {
            if (this instanceof TurnkeyIndexedDbClient) {
                await storage.storeSession(session, base.AuthClient.IndexedDb);
            }
            else {
                // Throw an error if the client is not an indexedDb client
                throw new Error("You must use an indexedDb client to log in with a session.");
            }
        };
        /**
         * Log in with a passkey.
         * To be used in conjunction with a `passkeyStamper`
         *
         * @param LoginWithPasskeyParams
         *   @param params.sessionType - The type of session to create
         *   @param params.publicKey - The public key of indexedDb
         *   @param params.expirationSeconds - Expiration time for the session in seconds. Defaults to 900 seconds or 15 minutes.
         * @returns {Promise<void>}
         */
        this.loginWithPasskey = async (params) => {
            try {
                const { publicKey, organizationId, sessionType = sdkTypes.SessionType.READ_WRITE, expirationSeconds = constants.DEFAULT_SESSION_EXPIRATION_IN_SECONDS, } = params;
                // Create a read-only session
                if (sessionType === sdkTypes.SessionType.READ_ONLY) {
                    const readOnlySessionResult = await this.createReadOnlySession({});
                    const session = {
                        sessionType: sdkTypes.SessionType.READ_ONLY,
                        userId: readOnlySessionResult.userId,
                        organizationId: readOnlySessionResult.organizationId,
                        expiry: Number(readOnlySessionResult.sessionExpiry),
                        token: readOnlySessionResult.session, // Once we have api key session scopes this can change
                    };
                    await storage.storeSession(session, base.AuthClient.Passkey);
                    // Create a read-write session
                }
                else if (sessionType === sdkTypes.SessionType.READ_WRITE) {
                    if (!publicKey) {
                        throw new Error("You must provide a publicKey to create a passkey read write session.");
                    }
                    const sessionResponse = await this.stampLogin({
                        publicKey,
                        expirationSeconds,
                        ...(organizationId && { organizationId }),
                    });
                    await storage.storeSession(sessionResponse.session, base.AuthClient.IndexedDb);
                }
                else {
                    throw new Error(`Invalid session type passed: ${sessionType}`);
                }
            }
            catch (error) {
                throw new Error(`Unable to log in with the provided passkey: ${error}`);
            }
        };
        /**
         * Log in with a browser wallet.
         *
         * @param LoginWithWalletParams
         *   @param params.sessionType - The type of session to create
         *   @param params.publicKey - The public key of indexedDb
         *   @param params.expirationSeconds - The expiration time for the session in seconds
         * @returns {Promise<void>}
         */
        this.loginWithWallet = async (params) => {
            try {
                const { publicKey, organizationId, sessionType = sdkTypes.SessionType.READ_WRITE, expirationSeconds = constants.DEFAULT_SESSION_EXPIRATION_IN_SECONDS, } = params;
                if (sessionType === sdkTypes.SessionType.READ_ONLY) {
                    const readOnlySessionResult = await this.createReadOnlySession({});
                    const session = {
                        sessionType: sdkTypes.SessionType.READ_ONLY,
                        userId: readOnlySessionResult.userId,
                        organizationId: readOnlySessionResult.organizationId,
                        expiry: Number(readOnlySessionResult.sessionExpiry),
                        token: readOnlySessionResult.session,
                    };
                    await storage.storeSession(session, base.AuthClient.Wallet);
                }
                else if (sessionType === sdkTypes.SessionType.READ_WRITE) {
                    if (!publicKey) {
                        throw new Error("You must provide a publicKey to create a read-write session.");
                    }
                    const sessionResponse = await this.stampLogin({
                        publicKey: publicKey,
                        expirationSeconds,
                        ...(organizationId && { organizationId }),
                    });
                    await storage.storeSession(sessionResponse.session, base.AuthClient.IndexedDb);
                }
                else {
                    throw new Error(`Invalid session type passed: ${sessionType}`);
                }
            }
            catch (error) {
                throw new Error(`Unable to log in with the provided wallet: ${error}`);
            }
        };
        /**
         * Removes authentication factors from an end user.
         *
         * This function allows selectively removing:
         * - Phone number
         * - Email
         * - Authenticators (by ID)
         * - OAuth providers (by ID)
         * - API keys (by ID)
         *
         * All removal operations are executed in parallel if multiple
         * parameters are provided.
         *
         * @param params - A structured object containing all the removal parameters
         *   @param params.userId - Unique identifier of the user
         *   @param params.phoneNumber - true to remove the phone number
         *   @param params.email - true to remove the email
         *   @param params.authenticatorIds - Array of authenticator IDs to remove
         *   @param params.oauthProviderIds - Array of OAuth provider IDs to remove
         *   @param params.apiKeyIds - Array of API key IDs to remove
         * @returns A promise that resolves to an array of results from each removal operation
         */
        this.deleteUserAuth = async (params) => {
            try {
                const { userId, phoneNumber, email, authenticatorIds, oauthProviderIds, apiKeyIds, } = params;
                const promises = [];
                if (phoneNumber) {
                    promises.push(this.updateUser({ userId, userPhoneNumber: "", userTagIds: [] }));
                }
                if (email) {
                    promises.push(this.updateUser({ userId, userEmail: "", userTagIds: [] }));
                }
                if (authenticatorIds && authenticatorIds.length > 0) {
                    promises.push(this.deleteAuthenticators({ userId, authenticatorIds }));
                }
                if (oauthProviderIds && oauthProviderIds.length > 0) {
                    promises.push(this.deleteOauthProviders({ userId, providerIds: oauthProviderIds }));
                }
                if (apiKeyIds && apiKeyIds.length > 0) {
                    promises.push(this.deleteApiKeys({ userId, apiKeyIds }));
                }
                // Execute all removal operations in parallel
                return await Promise.all(promises);
            }
            catch (error) {
                // Surface error
                throw error;
            }
        };
        /**
         * Adds or updates authentication factors for an end user.
         *
         * This function allows selectively adding:
         * - Phone number
         * - Email
         * - Authenticators
         * - OAuth providers
         * - API keys
         *
         * All additions/updates are executed in parallel if multiple
         * parameters are provided.
         *
         * @param params - A structured object containing all the addition/update parameters
         *   @param params.userId - Unique identifier of the user
         *   @param params.phoneNumber - New phone number for the user
         *   @param params.email - New email address for the user
         *   @param params.authenticators - Array of authenticator objects to create
         *   @param params.oauthProviders - Array of OAuth provider objects to create
         *   @param params.apiKeys - Array of API key objects to create
         * @returns A promise that resolves to an array of results from each addition or update
         */
        this.addUserAuth = async (params) => {
            try {
                const { userId, phoneNumber, email, authenticators, oauthProviders, apiKeys, } = params;
                const promises = [];
                if (phoneNumber) {
                    promises.push(this.updateUser({
                        userId,
                        userPhoneNumber: phoneNumber,
                        userTagIds: [],
                    }));
                }
                if (email) {
                    promises.push(this.updateUser({ userId, userEmail: email, userTagIds: [] }));
                }
                if (authenticators && authenticators.length > 0) {
                    promises.push(this.createAuthenticators({ userId, authenticators }));
                }
                if (oauthProviders && oauthProviders.length > 0) {
                    promises.push(this.createOauthProviders({ userId, oauthProviders }));
                }
                if (apiKeys && apiKeys.length > 0) {
                    promises.push(this.createApiKeys({ userId, apiKeys }));
                }
                // Execute all additions/updates operations in parallel
                return await Promise.all(promises);
            }
            catch (error) {
                // Surface error
                throw error;
            }
        };
    }
    /**
     * Comprehensive authentication update for an end user.
     * Combines add/update and delete operations into a single call.
     *
     * The behavior is driven by whether values are set to:
     * - A string/array (to create or update)
     * - `null` or an array of IDs (to remove)
     *
     * All operations are executed in parallel where applicable.
     *
     * @param params - A structured object containing all the update parameters
     *   @param params.userId - Unique identifier of the user
     *   @param params.phoneNumber - String to set (new phone) or `null` to remove
     *   @param params.email - String to set (new email) or `null` to remove
     *   @param params.authenticators - Object describing authenticators to add or remove
     *   @param params.oauthProviders - Object describing OAuth providers to add or remove
     *   @param params.apiKeys - Object describing API keys to add or remove
     *
     * @returns A promise that resolves to a boolean indicating overall success
     */
    async updateUserAuth(params) {
        try {
            const { userId, phoneNumber, email, authenticators, oauthProviders, apiKeys, } = params;
            const promises = [];
            // Handle phone/email in a single updateUser call if both are changing,
            // or separate calls if only one is changing.
            const userUpdates = {};
            if (phoneNumber !== undefined) {
                userUpdates.userPhoneNumber = phoneNumber === null ? "" : phoneNumber;
            }
            if (email !== undefined) {
                userUpdates.userEmail = email === null ? "" : email;
            }
            if (Object.keys(userUpdates).length > 0) {
                promises.push(this.updateUser({ userId, ...userUpdates, userTagIds: [] }));
            }
            // Handle authenticators
            if (authenticators) {
                if (authenticators.add?.length) {
                    promises.push(this.createAuthenticators({
                        userId,
                        authenticators: authenticators.add,
                    }));
                }
                if (authenticators.deleteIds?.length) {
                    promises.push(this.deleteAuthenticators({
                        userId,
                        authenticatorIds: authenticators.deleteIds,
                    }));
                }
            }
            // Handle OAuth providers
            if (oauthProviders) {
                if (oauthProviders.add?.length) {
                    promises.push(this.createOauthProviders({
                        userId,
                        oauthProviders: oauthProviders.add,
                    }));
                }
                if (oauthProviders.deleteIds?.length) {
                    promises.push(this.deleteOauthProviders({
                        userId,
                        providerIds: oauthProviders.deleteIds,
                    }));
                }
            }
            // Handle API keys
            if (apiKeys) {
                if (apiKeys.add?.length) {
                    promises.push(this.createApiKeys({
                        userId,
                        apiKeys: apiKeys.add,
                    }));
                }
                if (apiKeys.deleteIds?.length) {
                    promises.push(this.deleteApiKeys({
                        userId,
                        apiKeyIds: apiKeys.deleteIds,
                    }));
                }
            }
            // Execute all requested operations in parallel
            await Promise.all(promises);
            return true;
        }
        catch (error) {
            // Surface error
            throw error;
        }
    }
}
class TurnkeyPasskeyClient extends TurnkeyBrowserClient {
    constructor(config) {
        super(config, base.AuthClient.Passkey);
        /**
         * Create a passkey for an end-user, taking care of various lower-level details.
         *
         * @returns {Promise<Passkey>}
         */
        this.createUserPasskey = async (config = {}) => {
            const challenge = utils.generateRandomBuffer();
            const encodedChallenge = utils.base64UrlEncode(challenge);
            const authenticatorUserId = utils.generateRandomBuffer();
            // WebAuthn credential options options can be found here:
            // https://www.w3.org/TR/webauthn-2/#sctn-sample-registration
            //
            // All pubkey algorithms can be found here: https://www.iana.org/assignments/cose/cose.xhtml#algorithms
            // Turnkey only supports ES256 (-7) and RS256 (-257)
            //
            // The pubkey type only supports one value, "public-key"
            // See https://www.w3.org/TR/webauthn-2/#enumdef-publickeycredentialtype for more details
            // TODO: consider un-nesting these config params
            const webauthnConfig = {
                publicKey: {
                    rp: {
                        id: config.publicKey?.rp?.id ?? this.rpId,
                        name: config.publicKey?.rp?.name ?? "",
                    },
                    challenge: config.publicKey?.challenge ?? challenge,
                    pubKeyCredParams: config.publicKey?.pubKeyCredParams ?? [
                        {
                            type: "public-key",
                            alg: -7,
                        },
                        {
                            type: "public-key",
                            alg: -257,
                        },
                    ],
                    user: {
                        id: config.publicKey?.user?.id ?? authenticatorUserId,
                        name: config.publicKey?.user?.name ?? "Default User",
                        displayName: config.publicKey?.user?.displayName ?? "Default User",
                    },
                    authenticatorSelection: {
                        authenticatorAttachment: config.publicKey?.authenticatorSelection?.authenticatorAttachment ??
                            undefined, // default to empty
                        requireResidentKey: config.publicKey?.authenticatorSelection?.requireResidentKey ??
                            true,
                        residentKey: config.publicKey?.authenticatorSelection?.residentKey ?? "required",
                        userVerification: config.publicKey?.authenticatorSelection?.userVerification ??
                            "preferred",
                    },
                },
            };
            const attestation = await http.getWebAuthnAttestation(webauthnConfig);
            return {
                encodedChallenge: config.publicKey?.challenge
                    ? utils.base64UrlEncode(config.publicKey?.challenge)
                    : encodedChallenge,
                attestation,
            };
        };
        this.rpId = this.stamper.rpId;
    }
}
/**
 * TurnkeyIframeClient is a client that uses an iframe to interact with the Turnkey API.
 * It is used to create read-write sessions, and to inject credential bundles into the iframe.
 * It is also used to extract encrypted credential bundles from the iframe.
 * @extends TurnkeyBrowserClient
 */
class TurnkeyIframeClient extends TurnkeyBrowserClient {
    constructor(config) {
        super(config, base.AuthClient.Iframe);
        this.injectCredentialBundle = async (credentialBundle) => {
            return await this.stamper.injectCredentialBundle(credentialBundle);
        };
        this.injectWalletExportBundle = async (credentialBundle, organizationId) => {
            return await this.stamper.injectWalletExportBundle(credentialBundle, organizationId);
        };
        this.injectKeyExportBundle = async (credentialBundle, organizationId, keyFormat) => {
            return await this.stamper.injectKeyExportBundle(credentialBundle, organizationId, keyFormat);
        };
        this.injectImportBundle = async (bundle, organizationId, userId) => {
            return await this.stamper.injectImportBundle(bundle, organizationId, userId);
        };
        this.extractWalletEncryptedBundle = async () => {
            return await this.stamper.extractWalletEncryptedBundle();
        };
        this.extractKeyEncryptedBundle = async (keyFormat) => {
            return await this.stamper.extractKeyEncryptedBundle(keyFormat);
        };
        this.getEmbeddedPublicKey = async () => {
            return await this.stamper.getEmbeddedPublicKey();
        };
        this.clearEmbeddedKey = async () => {
            return await this.stamper.clearEmbeddedKey();
        };
        this.initEmbeddedKey = async () => {
            return await this.stamper.initEmbeddedKey();
        };
        this.iframePublicKey = this.stamper.iframePublicKey;
    }
}
class TurnkeyWalletClient extends TurnkeyBrowserClient {
    constructor(config) {
        super(config, base.AuthClient.Wallet);
        this.wallet = config.wallet;
    }
    async getPublicKey() {
        return this.wallet.getPublicKey();
    }
    getWalletInterface() {
        return this.wallet;
    }
}
/**
 * TurnkeyIndexedDbClient is a client that uses IndexedDb to interact with the Turnkey API.
 * @extends TurnkeyBrowserClient
 */
class TurnkeyIndexedDbClient extends TurnkeyBrowserClient {
    constructor(config) {
        super(config, base.AuthClient.IndexedDb);
        this.clear = async () => {
            return await this.stamper.clear();
        };
        this.getPublicKey = async () => {
            return await this.stamper.getPublicKey();
        };
        this.init = async () => {
            return await this.stamper.init();
        };
        this.resetKeyPair = async (externalKeyPair) => {
            return await this.stamper.resetKeyPair(externalKeyPair);
        };
    }
}

exports.TurnkeyBrowserClient = TurnkeyBrowserClient;
exports.TurnkeyIframeClient = TurnkeyIframeClient;
exports.TurnkeyIndexedDbClient = TurnkeyIndexedDbClient;
exports.TurnkeyPasskeyClient = TurnkeyPasskeyClient;
exports.TurnkeyWalletClient = TurnkeyWalletClient;
//# sourceMappingURL=browser-clients.js.map

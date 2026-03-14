import type { WalletInterface } from "@turnkey/wallet-stamper";
import type { KeyFormat } from "@turnkey/iframe-stamper";
import type * as SdkApiTypes from "../__generated__/sdk_api_types";
import { TurnkeyBaseClient } from "../__clients__/base-client";
import { AuthClient, TurnkeySDKClientConfig, TurnkeyWalletClientConfig, LoginWithBundleParams, LoginWithPasskeyParams, LoginWithWalletParams, RefreshSessionParams } from "@types";
import type { Passkey } from "@models";
export interface OauthProvider {
    providerName: string;
    oidcToken: string;
}
export interface ApiKey {
    apiKeyName: string;
    publicKey: string;
    curveType: "API_KEY_CURVE_P256" | "API_KEY_CURVE_SECP256K1" | "API_KEY_CURVE_ED25519";
    expirationSeconds?: string;
}
export interface Authenticator {
    authenticatorName: string;
    challenge: string;
    attestation: {
        credentialId: string;
        clientDataJson: string;
        attestationObject: string;
        transports: ("AUTHENTICATOR_TRANSPORT_BLE" | "AUTHENTICATOR_TRANSPORT_INTERNAL" | "AUTHENTICATOR_TRANSPORT_NFC" | "AUTHENTICATOR_TRANSPORT_USB" | "AUTHENTICATOR_TRANSPORT_HYBRID")[];
    };
}
interface UpdateUserAuthParams {
    userId: string;
    phoneNumber?: string | null;
    email?: string | null;
    authenticators?: {
        add?: Authenticator[];
        deleteIds?: string[];
    };
    oauthProviders?: {
        add?: OauthProvider[];
        deleteIds?: string[];
    };
    apiKeys?: {
        add?: ApiKey[];
        deleteIds?: string[];
    };
}
interface DeleteUserAuthParams {
    userId: string;
    phoneNumber?: boolean;
    email?: boolean;
    authenticatorIds?: string[];
    oauthProviderIds?: string[];
    apiKeyIds?: string[];
}
interface AddUserAuthParams {
    userId: string;
    phoneNumber?: string;
    email?: string;
    authenticators?: Authenticator[];
    oauthProviders?: OauthProvider[];
    apiKeys?: ApiKey[];
}
export declare class TurnkeyBrowserClient extends TurnkeyBaseClient {
    constructor(config: TurnkeySDKClientConfig, authClient?: AuthClient);
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
    login: (config?: {
        organizationId?: string;
    }) => Promise<SdkApiTypes.TCreateReadOnlySessionResponse>;
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
    refreshSession: ({ sessionType, expirationSeconds, invalidateExisting, publicKey, }?: RefreshSessionParams) => Promise<void>;
    /**
     * Log in with a bundle. This method uses a bundle sent to the end user email
     * To be used in conjunction with an `iframeStamper`.
     *
     * @param LoginWithBundleParams
     *   @param params.bundle - Credential bundle to log in with
     *   @param params.expirationSeconds - Expiration time for the session in seconds. Defaults to 900 seconds or 15 minutes.
     * @returns {Promise<void>}
     */
    loginWithBundle: (params: LoginWithBundleParams) => Promise<void>;
    /**
     * Log in with a session returns from Turnkey. This method uses a session from server actions and stores it and the active client in local storage
     * To be used in conjunction with an `indexeDbStamper`.
     *
     * @param session
     * @returns {Promise<void>}
     */
    loginWithSession: (session: string) => Promise<void>;
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
    loginWithPasskey: (params: LoginWithPasskeyParams) => Promise<void>;
    /**
     * Log in with a browser wallet.
     *
     * @param LoginWithWalletParams
     *   @param params.sessionType - The type of session to create
     *   @param params.publicKey - The public key of indexedDb
     *   @param params.expirationSeconds - The expiration time for the session in seconds
     * @returns {Promise<void>}
     */
    loginWithWallet: (params: LoginWithWalletParams) => Promise<void>;
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
    deleteUserAuth: (params: DeleteUserAuthParams) => Promise<any[]>;
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
    addUserAuth: (params: AddUserAuthParams) => Promise<any[]>;
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
    updateUserAuth(params: UpdateUserAuthParams): Promise<boolean>;
}
export declare class TurnkeyPasskeyClient extends TurnkeyBrowserClient {
    rpId: string;
    constructor(config: TurnkeySDKClientConfig);
    /**
     * Create a passkey for an end-user, taking care of various lower-level details.
     *
     * @returns {Promise<Passkey>}
     */
    createUserPasskey: (config?: Record<any, any>) => Promise<Passkey>;
}
/**
 * TurnkeyIframeClient is a client that uses an iframe to interact with the Turnkey API.
 * It is used to create read-write sessions, and to inject credential bundles into the iframe.
 * It is also used to extract encrypted credential bundles from the iframe.
 * @extends TurnkeyBrowserClient
 */
export declare class TurnkeyIframeClient extends TurnkeyBrowserClient {
    iframePublicKey: string | null;
    constructor(config: TurnkeySDKClientConfig);
    injectCredentialBundle: (credentialBundle: string) => Promise<boolean>;
    injectWalletExportBundle: (credentialBundle: string, organizationId: string) => Promise<boolean>;
    injectKeyExportBundle: (credentialBundle: string, organizationId: string, keyFormat?: KeyFormat | undefined) => Promise<boolean>;
    injectImportBundle: (bundle: string, organizationId: string, userId: string) => Promise<boolean>;
    extractWalletEncryptedBundle: () => Promise<string>;
    extractKeyEncryptedBundle: (keyFormat?: KeyFormat | undefined) => Promise<string>;
    getEmbeddedPublicKey: () => Promise<string | null>;
    clearEmbeddedKey: () => Promise<null>;
    initEmbeddedKey: () => Promise<string | null>;
}
export declare class TurnkeyWalletClient extends TurnkeyBrowserClient {
    private wallet;
    constructor(config: TurnkeyWalletClientConfig);
    getPublicKey(): Promise<string>;
    getWalletInterface(): WalletInterface;
}
/**
 * TurnkeyIndexedDbClient is a client that uses IndexedDb to interact with the Turnkey API.
 * @extends TurnkeyBrowserClient
 */
export declare class TurnkeyIndexedDbClient extends TurnkeyBrowserClient {
    constructor(config: TurnkeySDKClientConfig);
    clear: () => Promise<void>;
    getPublicKey: () => Promise<string | null>;
    init: () => Promise<void>;
    resetKeyPair: (externalKeyPair?: CryptoKeyPair) => Promise<void>;
}
export {};
//# sourceMappingURL=browser-clients.d.ts.map
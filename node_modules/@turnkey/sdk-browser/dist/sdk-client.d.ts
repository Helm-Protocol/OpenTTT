import { type WalletInterface } from "@turnkey/wallet-stamper";
import type { Session } from "@turnkey/sdk-types";
import { type TurnkeySDKBrowserConfig, Stamper, IframeClientParams, PasskeyClientParams } from "./__types__/base";
import { TurnkeyBrowserClient, TurnkeyIframeClient, TurnkeyPasskeyClient, TurnkeyIndexedDbClient, TurnkeyWalletClient } from "./__clients__/browser-clients";
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
export declare class TurnkeyBrowserSDK {
    config: TurnkeySDKBrowserConfig;
    protected stamper: Stamper | undefined;
    constructor(config: TurnkeySDKBrowserConfig);
    /**
     * Creates a passkey client. The parameters override the default values passed to the underlying Turnkey `WebauthnStamper`
     * @param PasskeyClientParams
     * @returns new TurnkeyPasskeyClient
     */
    passkeyClient: (params?: PasskeyClientParams) => TurnkeyPasskeyClient;
    iframeClient: (params: IframeClientParams) => Promise<TurnkeyIframeClient>;
    walletClient: (wallet: WalletInterface) => TurnkeyWalletClient;
    indexedDbClient: () => Promise<TurnkeyIndexedDbClient>;
    serverSign: <TResponseType>(methodName: string, params: any[], serverSignUrl?: string) => Promise<TResponseType>;
    /**
     * If there is a valid, active session, this will parse it and return it
     *
     * @returns {Promise<Session | undefined>}
     */
    getSession: () => Promise<Session | undefined>;
    /**
     * If there is a valid, active session, this will return it without parsing it
     *
     * @returns {Promise<Session | undefined>}
     */
    getRawSession: () => Promise<string | undefined>;
    /**
     * Clears out all data pertaining to an end user session.
     *
     * @returns {Promise<boolean>}
     */
    logout: () => Promise<boolean>;
}
export { TurnkeyBrowserClient, TurnkeyIframeClient, TurnkeyPasskeyClient, TurnkeyIndexedDbClient, TurnkeyWalletClient, };
//# sourceMappingURL=sdk-client.d.ts.map
/// <reference lib="dom" />
interface DecryptExportBundleParams {
    exportBundle: string;
    organizationId: string;
    embeddedKey: string;
    dangerouslyOverrideSignerPublicKey?: string;
    keyFormat?: "SOLANA" | "HEXADECIMAL";
    returnMnemonic: boolean;
}
interface EncryptPrivateKeyToBundleParams {
    privateKey: string;
    keyFormat: string;
    importBundle: string;
    userId: string;
    organizationId: string;
    dangerouslyOverrideSignerPublicKey?: string;
}
interface EncryptWalletToBundleParams {
    mnemonic: string;
    importBundle: string;
    userId: string;
    organizationId: string;
    dangerouslyOverrideSignerPublicKey?: string;
}
export declare enum Enclave {
    NOTARIZER = "notarizer",
    SIGNER = "signer",
    EVM_PARSER = "evm-parser",
    TLS_FETCHER = "tls-fetcher",
    UMP = "ump"
}
/**
 * Decrypt an encrypted email auth/recovery or oauth credential bundle.
 *
 * @param {string} credentialBundle - The encrypted credential bundle.
 * @param {string} embeddedKey - The private key for decryption.
 * @returns {string} - The decrypted data or null if decryption fails.
 * @throws {Error} - If unable to decrypt the credential bundle
 */
export declare const decryptCredentialBundle: (credentialBundle: string, embeddedKey: string) => string;
/**
 * Decrypt an encrypted export bundle (such as a private key or wallet account bundle).
 *
 * This function verifies the enclave signature to ensure the authenticity of the encrypted data.
 * It uses HPKE (Hybrid Public Key Encryption) to decrypt the contents of the bundle and returns
 * either the decrypted mnemonic or the decrypted data in hexadecimal format, based on the
 * `returnMnemonic` flag.
 *
 * @param {DecryptExportBundleParams} params - An object containing the following properties:
 *   - exportBundle {string}: The encrypted export bundle in JSON format.
 *   - organizationId {string}: The expected organization ID to verify against the signed data.
 *   - embeddedKey {string}: The private key used for decrypting the data.
 *   - dangerouslyOverrideSignerPublicKey {string} [Optional]: Optionally override the default signer public key used for verifying the signature. This should only be done for testing
 *   - returnMnemonic {boolean}: If true, returns the decrypted data as a mnemonic string; otherwise, returns it in hexadecimal format.
 * @returns {Promise<string>} - A promise that resolves to the decrypted mnemonic or decrypted hexadecimal data.
 * @throws {Error} - If decryption or signature verification fails, throws an error with details.
 */
export declare const decryptExportBundle: ({ exportBundle, embeddedKey, organizationId, dangerouslyOverrideSignerPublicKey, keyFormat, returnMnemonic, }: DecryptExportBundleParams) => Promise<string>;
/**
 * Verifies a signature from a Turnkey stamp using ECDSA and SHA-256.
 *
 * @param {string} publicKey - The public key of the authenticator (e.g. WebAuthn or P256 API key).
 * @param {string} signature - The ECDSA signature in DER format.
 * @param {string} signedData - The data that was signed (e.g. JSON-stringified Turnkey request body).
 * @returns {Promise<boolean>} - Returns true if the signature is valid, otherwise throws an error.
 *
 * @example
 *
 * const stampedRequest = await turnkeyClient.stampGetWhoami(...);
 * const decodedStampContents = atob(stampedRequest.stamp.stampHeaderValue);
 * const parsedStampContents = JSON.parse(decodedStampContents);
 * const signature = parsedStampContents.signature;
 *
 * await verifyStampSignature(publicKey, signature, stampedRequest.body)
 */
export declare const verifyStampSignature: (publicKey: string, signature: string, signedData: string) => Promise<boolean>;
/**
 * Encrypts a private key bundle using HPKE and verifies the enclave signature.
 *
 * @param {EncryptPrivateKeyToBundleParams} params - An object containing the private key, key format, bundle, user, and organization details. Optionally, you can override the default signer key (for testing purposes)
 * @returns {Promise<string>} - A promise that resolves to a JSON string representing the encrypted bundle.
 * @throws {Error} - If enclave signature verification or any other validation fails.
 */
export declare const encryptPrivateKeyToBundle: ({ privateKey, keyFormat, importBundle, userId, organizationId, dangerouslyOverrideSignerPublicKey, }: EncryptPrivateKeyToBundleParams) => Promise<string>;
/**
  /**
   * Encrypts a mnemonic wallet bundle using HPKE and verifies the enclave signature.
   *
   * @param {EncryptWalletToBundleParams} params - An object containing the mnemonic, bundle, user, and organization details. Optionally, you can override the default signer key (for testing purposes).
   * @returns {Promise<string>} - A promise that resolves to a JSON string representing the encrypted wallet bundle.
   * @throws {Error} - If enclave signature verification or any other validation fails.
   */
export declare const encryptWalletToBundle: ({ mnemonic, importBundle, userId, organizationId, dangerouslyOverrideSignerPublicKey, }: EncryptWalletToBundleParams) => Promise<string>;
/**
 * Verifies that a **session JWT** was signed by Turnkey’s
 * notarizer key (P-256 / ES256, compact 64-byte r‖s signature).
 *
 * How it works
 * ------------
 * 1.  Split the JWT into `header.payload.signature`.
 * 2.  **Double-hash** the string `"header.payload"`:
 *        `h1 = sha256(header.payload)`
 *        `msg = sha256(h1)`
 *     (The Rust signer feeds `h1` into `SigningKey::sign`, which hashes once
 *     more internally, yielding `msg`.)
 * 3.  Base64-URL-decode the signature (`r||s`, 64 bytes).
 * 4.  Import the notarizer public key (hex `04‖X‖Y` → `Uint8Array`).
 * 5.  Call `p256.verify(signature, msg, publicKey)`; noble treats the 32-byte
 *     `msg` as a pre-hashed digest and performs ECDSA verification.
 *
 * @param jwt   The session JWT to validate.
 * @param dangerouslyOverrideNotarizerPublicKey *(optional)* Hex-encoded
 *              uncompressed P-256 public key to verify against (use only in
 *              tests).  Defaults to the production notarizer key.
 * @returns `true` if the signature is valid for the given key, else `false`.
 * @throws  If the JWT is malformed.
 */
export declare const verifySessionJwtSignature: (jwt: string, dangerouslyOverrideNotarizerPublicKey?: string) => Promise<boolean>;
/**
 * Encrypts a message to an uncompressed P256 public key
 * The function takes in standard strings and converts them
 * to Uint8Arrays to be used by the lower level quorumKeyEncrypt
 * function. More details about how the encryption works is described
 * in that function's documentation.
 *
 * @param targetPublicKeyUncompressed A hex string uncompressed public key to encrypt a message to
 * @param message A standard string message to encrypt, does not have to be hex encoded
 * @returns {Promise<Uint8Array>} A borsh serialized envelope with the encrypted message (more details found in quorumKeyEncrypt)
 */
export declare const encryptToEnclave: (targetPublicKeyUncompressed: string, message: string) => Promise<Uint8Array>;
/**
 * Helper function used specifically to encrypt a client secret to
 * TLS Fetchers quorum key. This is used for client_secret upload
 * when enabling authentication with an OAuth 2.0 provider
 *
 * @param client_secret The client secret issued by the OAuth 2.0 provider
 * @param dangerouslyOverrideTlsFetcherPublicKey *(optional)* Hex-encoded
 *              uncompressed P-256 public key to encrypt to (use only in
 *              tests/dev environment).  Defaults to the production TLS Fetcher key.
 * @returns {Promise<string>} A hex encoded borsh serialized envelope with the encrypted client
 *                            secret meant to be passed to the CreateOauth2Credential Activity
 */
export declare const encryptOauth2ClientSecret: (client_secret: string, dangerouslyOverrideTlsFetcherPublicKey?: string) => Promise<string>;
/**
 * Helper function used specifically to encrypt your on ramp private/secret api keys
 * to the on ramp encryption public key. This is used before uploading your on ramp
 * credentials to Turnkey via the CreateFiatOnRampCredential activity
 *
 * @param secret The private/secret api key issued by the on ramp provider
 * @param dangerouslyOverrideOnRampEncryptionPublicKey *(optional)* Hex-encoded
 *              uncompressed P-256 public key to encrypt to (use only in
 *              tests/dev environment).  Defaults to the production on ramp encryption public key.
 * @returns {Promise<string>} A base58check encoded borsh serialized envelope with the encrypted secret
 *                            meant to be passed to the CreateFiatOnRampCredential activity
 */
export declare const encryptOnRampSecret: (secret: string, dangerouslyOverrideOnRampEncryptionPublicKey?: string) => string;
export {};
//# sourceMappingURL=turnkey.d.ts.map
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KMSSigner = exports.PrivySigner = exports.TurnkeySignerWrapper = exports.PrivateKeySigner = exports.TTTAbstractSigner = exports.SignerType = void 0;
exports.createSigner = createSigner;
const ethers_1 = require("ethers");
const errors_1 = require("./errors");
/**
 * Supported signer types in TTT SDK
 */
var SignerType;
(function (SignerType) {
    SignerType["PrivateKey"] = "privateKey";
    SignerType["Turnkey"] = "turnkey";
    SignerType["Privy"] = "privy";
    SignerType["KMS"] = "kms";
})(SignerType || (exports.SignerType = SignerType = {}));
/**
 * Base wrapper for all signers to ensure unified interface within the SDK
 */
class TTTAbstractSigner {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    async getAddress() {
        return this.inner.getAddress();
    }
}
exports.TTTAbstractSigner = TTTAbstractSigner;
/**
 * Standard Private Key Signer (Institutional/Dev use)
 */
class PrivateKeySigner extends TTTAbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.PrivateKeySigner = PrivateKeySigner;
/**
 * TEE-based institution-grade signer (Turnkey)
 */
class TurnkeySignerWrapper extends TTTAbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.TurnkeySignerWrapper = TurnkeySignerWrapper;
/**
 * Social/Embedded wallet signer (Privy)
 */
class PrivySigner extends TTTAbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.PrivySigner = PrivySigner;
/**
 * Cloud HSM (KMS) based signer
 */
class KMSSigner extends TTTAbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.KMSSigner = KMSSigner;
/**
 * Extract the uncompressed secp256k1 public key from a DER-encoded
 * SubjectPublicKeyInfo structure using proper ASN.1 parsing.
 *
 * DER layout: SEQUENCE { SEQUENCE { OID, PARAMS }, BITSTRING { 0x00, key } }
 * We locate the BITSTRING tag (0x03), read its length, skip the
 * "unused bits" byte, and return the remaining 65 bytes (04 || X || Y).
 */
function extractPublicKeyFromDER(der) {
    let pos = 0;
    function readTag() {
        if (pos >= der.length)
            throw new Error("DER parse error: unexpected end of data while reading tag");
        return der[pos++];
    }
    function readLength() {
        if (pos >= der.length)
            throw new Error("DER parse error: unexpected end of data while reading length");
        const first = der[pos++];
        if (first < 0x80)
            return first;
        const numBytes = first & 0x7f;
        if (numBytes === 0 || numBytes > 4)
            throw new Error(`DER parse error: unsupported length encoding (${numBytes} bytes)`);
        let length = 0;
        for (let i = 0; i < numBytes; i++) {
            if (pos >= der.length)
                throw new Error("DER parse error: unexpected end of data in multi-byte length");
            length = (length << 8) | der[pos++];
        }
        return length;
    }
    // Outer SEQUENCE
    const outerTag = readTag();
    if (outerTag !== 0x30)
        throw new Error(`DER parse error: expected SEQUENCE (0x30), got 0x${outerTag.toString(16)}`);
    readLength(); // outer sequence length
    // Inner SEQUENCE (algorithm identifier) -- skip it entirely
    const innerTag = readTag();
    if (innerTag !== 0x30)
        throw new Error(`DER parse error: expected inner SEQUENCE (0x30), got 0x${innerTag.toString(16)}`);
    const innerLen = readLength();
    pos += innerLen; // skip OID + params
    // BITSTRING containing the public key
    const bsTag = readTag();
    if (bsTag !== 0x03)
        throw new Error(`DER parse error: expected BITSTRING (0x03), got 0x${bsTag.toString(16)}`);
    const bsLen = readLength();
    const unusedBits = der[pos++];
    if (unusedBits !== 0x00)
        throw new Error(`DER parse error: expected 0 unused bits in BITSTRING, got ${unusedBits}`);
    const keyBytes = der.slice(pos, pos + bsLen - 1);
    if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
        throw new Error(`DER parse error: expected 65-byte uncompressed secp256k1 key (04||X||Y), got ${keyBytes.length} bytes`);
    }
    return keyBytes;
}
/**
 * Internal utility to parse DER signature to R and S
 */
function parseDERSignature(sig) {
    if (sig[0] !== 0x30)
        throw new Error("Invalid DER signature: not a sequence");
    let pos = 2;
    if (sig[pos] !== 0x02)
        throw new Error("Invalid DER signature: expected integer for R");
    let rLen = sig[pos + 1];
    pos += 2;
    let r = sig.slice(pos, pos + rLen);
    if (r[0] === 0x00)
        r = r.slice(1);
    pos += rLen;
    if (sig[pos] !== 0x02)
        throw new Error("Invalid DER signature: expected integer for S");
    let sLen = sig[pos + 1];
    pos += 2;
    let s = sig.slice(pos, pos + sLen);
    if (s[0] === 0x00)
        s = s.slice(1);
    return {
        r: "0x" + Buffer.from(r).toString('hex').padStart(64, '0'),
        s: "0x" + Buffer.from(s).toString('hex').padStart(64, '0')
    };
}
/**
 * AWS KMS Ethers Signer Implementation
 */
class AWSKMSEthersSigner extends ethers_1.AbstractSigner {
    client;
    keyId;
    address = null;
    constructor(client, // KMSClient
    keyId, provider) {
        super(provider);
        this.client = client;
        this.keyId = keyId;
    }
    async getAddress() {
        if (this.address)
            return this.address;
        // @ts-ignore
        const { GetPublicKeyCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-kms')));
        const command = new GetPublicKeyCommand({ KeyId: this.keyId });
        const response = await this.client.send(command);
        const publicKeyDer = response.PublicKey;
        const pubKey = extractPublicKeyFromDER(Buffer.from(publicKeyDer));
        this.address = (0, ethers_1.computeAddress)("0x" + pubKey.toString('hex'));
        return this.address;
    }
    async signMessage(message) {
        const digest = (0, ethers_1.hashMessage)(message);
        return this._signDigest(digest);
    }
    async signTransaction(tx) {
        const resolved = await (0, ethers_1.resolveProperties)(tx);
        const baseTx = ethers_1.Transaction.from(resolved);
        const digest = baseTx.unsignedHash;
        const sig = await this._signDigest(digest);
        const signature = ethers_1.Signature.from(sig);
        baseTx.signature = signature;
        return baseTx.serialized;
    }
    async signTypedData(domain, types, value) {
        const digest = ethers_1.TypedDataEncoder.hash(domain, types, value);
        return this._signDigest(digest);
    }
    async _signDigest(digest) {
        // @ts-ignore
        const { SignCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-kms')));
        const command = new SignCommand({
            KeyId: this.keyId,
            Message: Buffer.from(digest.slice(2), 'hex'),
            MessageType: 'DIGEST',
            SigningAlgorithm: 'ECDSA_SHA_256'
        });
        const response = await this.client.send(command);
        const derSig = response.Signature;
        const { r, s } = parseDERSignature(derSig);
        const addr = await this.getAddress();
        for (const v of [27, 28]) {
            const signature = ethers_1.Signature.from({ r, s, v });
            if ((0, ethers_1.recoverAddress)(digest, signature).toLowerCase() === addr.toLowerCase()) {
                return signature.serialized;
            }
        }
        throw new Error("Failed to recover recovery param V for AWS KMS signature");
    }
    connect(provider) {
        return new AWSKMSEthersSigner(this.client, this.keyId, provider);
    }
}
/**
 * GCP KMS Ethers Signer Implementation
 */
class GCPKMSEthersSigner extends ethers_1.AbstractSigner {
    client;
    name;
    address = null;
    constructor(client, // KeyManagementServiceClient
    name, // Fully qualified key version name
    provider) {
        super(provider);
        this.client = client;
        this.name = name;
    }
    async getAddress() {
        if (this.address)
            return this.address;
        const [publicKey] = await this.client.getPublicKey({ name: this.name });
        const pem = publicKey.pem;
        const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, '');
        const der = Buffer.from(base64, 'base64');
        const pubKey = extractPublicKeyFromDER(der);
        this.address = (0, ethers_1.computeAddress)("0x" + pubKey.toString('hex'));
        return this.address;
    }
    async signMessage(message) {
        return this._signDigest((0, ethers_1.hashMessage)(message));
    }
    async signTransaction(tx) {
        const resolved = await (0, ethers_1.resolveProperties)(tx);
        const baseTx = ethers_1.Transaction.from(resolved);
        const digest = baseTx.unsignedHash;
        const sig = await this._signDigest(digest);
        const signature = ethers_1.Signature.from(sig);
        baseTx.signature = signature;
        return baseTx.serialized;
    }
    async signTypedData(domain, types, value) {
        const digest = ethers_1.TypedDataEncoder.hash(domain, types, value);
        return this._signDigest(digest);
    }
    async _signDigest(digest) {
        const digestBuffer = Buffer.from(digest.slice(2), 'hex');
        const [response] = await this.client.asymmetricSign({
            name: this.name,
            digest: {
                sha256: digestBuffer
            }
        });
        const derSig = response.signature;
        const { r, s } = parseDERSignature(derSig);
        const addr = await this.getAddress();
        for (const v of [27, 28]) {
            const signature = ethers_1.Signature.from({ r, s, v });
            if ((0, ethers_1.recoverAddress)(digest, signature).toLowerCase() === addr.toLowerCase()) {
                return signature.serialized;
            }
        }
        throw new Error("Failed to recover recovery param V for GCP KMS signature");
    }
    connect(provider) {
        return new GCPKMSEthersSigner(this.client, this.name, provider);
    }
}
/**
 * Factory function to create appropriate signer based on config
 */
async function createSigner(config) {
    switch (config.type) {
        case 'privateKey': {
            let key = config.key;
            if (!key && config.envVar) {
                key = process.env[config.envVar];
            }
            if (!key)
                throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_MISSING_KEY, "[Signer] Private key missing", `Neither 'key' nor env var '${config.envVar}' was provided`, "Set the environment variable or provide the key directly in config.");
            if (!key.startsWith('0x'))
                key = '0x' + key;
            if (!(0, ethers_1.isHexString)(key, 32))
                throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_INVALID_KEY_FORMAT, "[Signer] Invalid private key format", "Expected 0x + 64 hex characters", "Provide a valid 32-byte hex private key.");
            const wallet = new ethers_1.Wallet(key);
            return new PrivateKeySigner(wallet);
        }
        case 'turnkey': {
            // Dynamic import to avoid mandatory dependency on @turnkey packages
            const { TurnkeySigner } = await Promise.resolve().then(() => __importStar(require("@turnkey/ethers")));
            const { ApiKeyStamper } = await Promise.resolve().then(() => __importStar(require("@turnkey/api-key-stamper")));
            const stamper = new ApiKeyStamper({
                apiPublicKey: config.apiPublicKey,
                apiPrivateKey: config.apiPrivateKey,
            });
            const turnkeySigner = new TurnkeySigner({
                baseUrl: config.apiBaseUrl,
                stamper,
                organizationId: config.organizationId,
                privateKeyId: config.privateKeyId,
            });
            return new TurnkeySignerWrapper(turnkeySigner);
        }
        case 'privy': {
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_PRIVY_NOT_IMPLEMENTED, "[Signer] Privy signer is not yet implemented. Use 'privateKey' or 'turnkey' instead.", "Privy embedded wallet support is planned but not available in this release.", "Use { type: 'privateKey', key: '0x...' } or { type: 'turnkey', ... } as your signer config.");
        }
        case 'kms': {
            if (config.provider === 'aws') {
                try {
                    // @ts-ignore
                    const { KMSClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-kms')));
                    const client = new KMSClient({ region: config.region || 'us-east-1' });
                    const awsSigner = new AWSKMSEthersSigner(client, config.keyId);
                    return new KMSSigner(awsSigner);
                }
                catch (e) {
                    throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_KMS_AWS_INIT_FAILED, "[Signer] AWS KMS initialization failed", e.message, "Ensure @aws-sdk/client-kms is installed and credentials are configured.");
                }
            }
            else if (config.provider === 'gcp') {
                if (!config.projectId || !config.locationId || !config.keyRingId || !config.keyVersionId) {
                    throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_KMS_GCP_MISSING_FIELDS, "[Signer] GCP KMS missing required fields", `projectId=${config.projectId}, locationId=${config.locationId}, keyRingId=${config.keyRingId}, keyVersionId=${config.keyVersionId}`, "Provide all required GCP KMS fields: projectId, locationId, keyRingId, keyVersionId.");
                }
                try {
                    // @ts-ignore
                    const { KeyManagementServiceClient } = await Promise.resolve().then(() => __importStar(require('@google-cloud/kms')));
                    const client = new KeyManagementServiceClient();
                    const name = client.cryptoKeyVersionPath(config.projectId, config.locationId, config.keyRingId, config.keyId, config.keyVersionId);
                    const gcpSigner = new GCPKMSEthersSigner(client, name);
                    return new KMSSigner(gcpSigner);
                }
                catch (e) {
                    throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_KMS_GCP_INIT_FAILED, "[Signer] GCP KMS initialization failed", e.message, "Ensure @google-cloud/kms is installed and application default credentials are set.");
                }
            }
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_KMS_UNSUPPORTED_PROVIDER, "[Signer] Unsupported KMS provider", `Provider: ${config.provider}`, "Use 'aws' or 'gcp'.");
        }
        default:
            // @ts-ignore
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_UNSUPPORTED_TYPE, `[Signer] Unsupported signer type`, `Type: ${config.type}`, "Provide a supported signer type: privateKey, turnkey, privy, kms.");
    }
}

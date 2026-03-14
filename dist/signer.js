"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KMSSigner = exports.PrivySigner = exports.TurnkeySignerWrapper = exports.PrivateKeySigner = exports.AbstractSigner = exports.SignerType = void 0;
exports.createSigner = createSigner;
const ethers_1 = require("ethers");
const ethers_2 = require("@turnkey/ethers");
const api_key_stamper_1 = require("@turnkey/api-key-stamper");
const server_auth_1 = require("@privy-io/server-auth");
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
class AbstractSigner {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    async getAddress() {
        return this.inner.getAddress();
    }
}
exports.AbstractSigner = AbstractSigner;
/**
 * Standard Private Key Signer (Institutional/Dev use)
 */
class PrivateKeySigner extends AbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.PrivateKeySigner = PrivateKeySigner;
/**
 * TEE-based institution-grade signer (Turnkey)
 */
class TurnkeySignerWrapper extends AbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.TurnkeySignerWrapper = TurnkeySignerWrapper;
/**
 * Social/Embedded wallet signer (Privy)
 */
class PrivySigner extends AbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.PrivySigner = PrivySigner;
/**
 * AWS/GCP KMS based signer
 */
class KMSSigner extends AbstractSigner {
    constructor(signer) {
        super(signer);
    }
}
exports.KMSSigner = KMSSigner;
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
                throw new errors_1.TTTSignerError("[Signer] Private key missing", `Neither 'key' nor env var '${config.envVar}' was provided`, "Set the environment variable or provide the key directly in config.");
            // Validation: 0x prefix + 64 hex chars
            if (!key.startsWith('0x'))
                key = '0x' + key;
            if (!(0, ethers_1.isHexString)(key, 32))
                throw new errors_1.TTTSignerError("[Signer] Invalid private key format", "Expected 0x + 64 hex characters", "Provide a valid 32-byte hex private key.");
            const wallet = new ethers_1.Wallet(key);
            return new PrivateKeySigner(wallet);
        }
        case 'turnkey': {
            const stamper = new api_key_stamper_1.ApiKeyStamper({
                apiPublicKey: config.apiPublicKey,
                apiPrivateKey: config.apiPrivateKey,
            });
            // @turnkey/ethers v1.3.25 expects these fields directly or in a different structure
            // Based on typical TurnkeySigner constructor:
            const turnkeySigner = new ethers_2.TurnkeySigner({
                baseUrl: config.apiBaseUrl,
                stamper,
                organizationId: config.organizationId,
                privateKeyId: config.privateKeyId,
            }); // Type cast due to possible version mismatch in @types/npm
            return new TurnkeySignerWrapper(turnkeySigner);
        }
        case 'privy': {
            const privy = new server_auth_1.PrivyClient(config.appId, config.appSecret);
            // Privy server-auth logic to get a signer for a walletId
            // This is a stub for the actual signer extraction from Privy
            throw new errors_1.TTTSignerError("[Signer] Privy wallet signer extraction not fully implemented", "Privy requires proper session context and walletId", "Refer to Privy server-auth documentation for server-side signing.");
        }
        case 'kms': {
            // TODO: Implement AWS/GCP KMS Signer
            throw new errors_1.TTTSignerError("[Signer] KMS not implemented", `KMS provider '${config.provider}' is not yet implemented.`, "Use privateKey or Turnkey for now.");
        }
        default:
            // @ts-ignore
            throw new errors_1.TTTSignerError(`[Signer] Unsupported signer type`, `Type: ${config.type}`, "Provide a supported signer type: privateKey, turnkey, privy, kms.");
    }
}

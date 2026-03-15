import { Signer, Wallet, isHexString, AbstractSigner, TransactionRequest, resolveProperties, Transaction, Signature, getAddress, computeAddress, hashMessage, keccak256, TypedDataDomain, TypedDataField, TypedDataEncoder, recoverAddress } from "ethers";
import { TTTSignerError, ERROR_CODES } from "./errors";

/**
 * Supported signer types in TTT SDK
 */
export enum SignerType {
  PrivateKey = 'privateKey',
  Turnkey = 'turnkey',
  Privy = 'privy',
  KMS = 'kms'
}

/**
 * Discriminated union for signer configuration
 */
export type SignerConfig = 
  | { type: 'privateKey'; key?: string; envVar?: string }
  | { type: 'turnkey'; apiBaseUrl: string; organizationId: string; privateKeyId: string; apiPublicKey: string; apiPrivateKey: string }
  | { type: 'privy'; appId: string; appSecret: string; walletId?: string }
  | { type: 'kms'; provider: 'aws' | 'gcp'; keyId: string; region?: string; projectId?: string; locationId?: string; keyRingId?: string; keyVersionId?: string };

/**
 * Base wrapper for all signers to ensure unified interface within the SDK
 */
export abstract class TTTAbstractSigner {
  constructor(public readonly inner: Signer) {}

  async getAddress(): Promise<string> {
    return this.inner.getAddress();
  }
}

/**
 * Standard Private Key Signer (Institutional/Dev use)
 */
export class PrivateKeySigner extends TTTAbstractSigner {
  constructor(signer: Wallet) {
    super(signer);
  }
}

/**
 * TEE-based institution-grade signer (Turnkey)
 */
export class TurnkeySignerWrapper extends TTTAbstractSigner {
  constructor(signer: Signer) {
    super(signer);
  }
}

/**
 * Social/Embedded wallet signer (Privy)
 */
export class PrivySigner extends TTTAbstractSigner {
  constructor(signer: Signer) {
    super(signer);
  }
}

/**
 * Cloud HSM (KMS) based signer
 */
export class KMSSigner extends TTTAbstractSigner {
  constructor(signer: Signer) {
    super(signer);
  }
}

/**
 * Extract the uncompressed secp256k1 public key from a DER-encoded
 * SubjectPublicKeyInfo structure using proper ASN.1 parsing.
 *
 * DER layout: SEQUENCE { SEQUENCE { OID, PARAMS }, BITSTRING { 0x00, key } }
 * We locate the BITSTRING tag (0x03), read its length, skip the
 * "unused bits" byte, and return the remaining 65 bytes (04 || X || Y).
 */
function extractPublicKeyFromDER(der: Buffer): Buffer {
  let pos = 0;

  function readTag(): number {
    if (pos >= der.length) throw new Error("DER parse error: unexpected end of data while reading tag");
    return der[pos++];
  }

  function readLength(): number {
    if (pos >= der.length) throw new Error("DER parse error: unexpected end of data while reading length");
    const first = der[pos++];
    if (first < 0x80) return first;
    const numBytes = first & 0x7f;
    if (numBytes === 0 || numBytes > 4) throw new Error(`DER parse error: unsupported length encoding (${numBytes} bytes)`);
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      if (pos >= der.length) throw new Error("DER parse error: unexpected end of data in multi-byte length");
      length = (length << 8) | der[pos++];
    }
    return length;
  }

  // Outer SEQUENCE
  const outerTag = readTag();
  if (outerTag !== 0x30) throw new Error(`DER parse error: expected SEQUENCE (0x30), got 0x${outerTag.toString(16)}`);
  readLength(); // outer sequence length

  // Inner SEQUENCE (algorithm identifier) -- skip it entirely
  const innerTag = readTag();
  if (innerTag !== 0x30) throw new Error(`DER parse error: expected inner SEQUENCE (0x30), got 0x${innerTag.toString(16)}`);
  const innerLen = readLength();
  pos += innerLen; // skip OID + params

  // BITSTRING containing the public key
  const bsTag = readTag();
  if (bsTag !== 0x03) throw new Error(`DER parse error: expected BITSTRING (0x03), got 0x${bsTag.toString(16)}`);
  const bsLen = readLength();
  const unusedBits = der[pos++];
  if (unusedBits !== 0x00) throw new Error(`DER parse error: expected 0 unused bits in BITSTRING, got ${unusedBits}`);

  const keyBytes = der.slice(pos, pos + bsLen - 1);
  if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
    throw new Error(`DER parse error: expected 65-byte uncompressed secp256k1 key (04||X||Y), got ${keyBytes.length} bytes`);
  }
  return keyBytes;
}

/**
 * Internal utility to parse DER signature to R and S
 */
function parseDERSignature(sig: Uint8Array): { r: string, s: string } {
  if (sig[0] !== 0x30) throw new Error("Invalid DER signature: not a sequence");
  
  let pos = 2;
  if (sig[pos] !== 0x02) throw new Error("Invalid DER signature: expected integer for R");
  let rLen = sig[pos + 1];
  pos += 2;
  let r = sig.slice(pos, pos + rLen);
  if (r[0] === 0x00) r = r.slice(1);
  pos += rLen;

  if (sig[pos] !== 0x02) throw new Error("Invalid DER signature: expected integer for S");
  let sLen = sig[pos + 1];
  pos += 2;
  let s = sig.slice(pos, pos + sLen);
  if (s[0] === 0x00) s = s.slice(1);

  return {
    r: "0x" + Buffer.from(r).toString('hex').padStart(64, '0'),
    s: "0x" + Buffer.from(s).toString('hex').padStart(64, '0')
  };
}

/**
 * AWS KMS Ethers Signer Implementation
 */
class AWSKMSEthersSigner extends AbstractSigner {
  private address: string | null = null;

  constructor(
    private client: any, // KMSClient
    private keyId: string,
    provider?: any
  ) {
    super(provider);
  }

  async getAddress(): Promise<string> {
    if (this.address) return this.address;
    
    // @ts-ignore
    const { GetPublicKeyCommand } = await import('@aws-sdk/client-kms');
    const command = new GetPublicKeyCommand({ KeyId: this.keyId });
    const response = await this.client.send(command);
    
    const publicKeyDer = response.PublicKey;
    const pubKey = extractPublicKeyFromDER(Buffer.from(publicKeyDer));
    this.address = computeAddress("0x" + pubKey.toString('hex'));
    return this.address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const digest = hashMessage(message);
    return this._signDigest(digest);
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    const resolved = await resolveProperties(tx);
    const baseTx = Transaction.from(resolved as any);
    const digest = baseTx.unsignedHash;
    
    const sig = await this._signDigest(digest);
    const signature = Signature.from(sig);
    
    baseTx.signature = signature;
    return baseTx.serialized;
  }

  async signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string> {
    const digest = TypedDataEncoder.hash(domain, types, value);
    return this._signDigest(digest);
  }

  private async _signDigest(digest: string): Promise<string> {
    // @ts-ignore
    const { SignCommand } = await import('@aws-sdk/client-kms');
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
      const signature = Signature.from({ r, s, v });
      if (recoverAddress(digest, signature).toLowerCase() === addr.toLowerCase()) {
        return signature.serialized;
      }
    }
    throw new Error("Failed to recover recovery param V for AWS KMS signature");
  }

  connect(provider: any): AWSKMSEthersSigner {
    return new AWSKMSEthersSigner(this.client, this.keyId, provider);
  }
}

/**
 * GCP KMS Ethers Signer Implementation
 */
class GCPKMSEthersSigner extends AbstractSigner {
  private address: string | null = null;

  constructor(
    private client: any, // KeyManagementServiceClient
    private name: string, // Fully qualified key version name
    provider?: any
  ) {
    super(provider);
  }

  async getAddress(): Promise<string> {
    if (this.address) return this.address;
    
    const [publicKey] = await this.client.getPublicKey({ name: this.name });
    const pem = publicKey.pem;
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, '');
    const der = Buffer.from(base64, 'base64');
    const pubKey = extractPublicKeyFromDER(der);
    this.address = computeAddress("0x" + pubKey.toString('hex'));
    return this.address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this._signDigest(hashMessage(message));
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    const resolved = await resolveProperties(tx);
    const baseTx = Transaction.from(resolved as any);
    const digest = baseTx.unsignedHash;
    
    const sig = await this._signDigest(digest);
    const signature = Signature.from(sig);
    
    baseTx.signature = signature;
    return baseTx.serialized;
  }

  async signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string> {
    const digest = TypedDataEncoder.hash(domain, types, value);
    return this._signDigest(digest);
  }

  private async _signDigest(digest: string): Promise<string> {
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
      const signature = Signature.from({ r, s, v });
      if (recoverAddress(digest, signature).toLowerCase() === addr.toLowerCase()) {
        return signature.serialized;
      }
    }
    throw new Error("Failed to recover recovery param V for GCP KMS signature");
  }

  connect(provider: any): GCPKMSEthersSigner {
    return new GCPKMSEthersSigner(this.client, this.name, provider);
  }
}

/**
 * Factory function to create appropriate signer based on config
 */
export async function createSigner(config: SignerConfig): Promise<TTTAbstractSigner> {
  switch (config.type) {
    case 'privateKey': {
      let key = config.key;
      if (!key && config.envVar) {
        key = process.env[config.envVar];
      }
      if (!key) throw new TTTSignerError(ERROR_CODES.SIGNER_MISSING_KEY, "[Signer] Private key missing", `Neither 'key' nor env var '${config.envVar}' was provided`, "Set the environment variable or provide the key directly in config.");
      
      if (!key.startsWith('0x')) key = '0x' + key;
      if (!isHexString(key, 32)) throw new TTTSignerError(ERROR_CODES.SIGNER_INVALID_KEY_FORMAT, "[Signer] Invalid private key format", "Expected 0x + 64 hex characters", "Provide a valid 32-byte hex private key.");
      
      const wallet = new Wallet(key);
      return new PrivateKeySigner(wallet);
    }

    case 'turnkey': {
      // Dynamic import to avoid mandatory dependency on @turnkey packages
      const { TurnkeySigner } = await import("@turnkey/ethers");
      const { ApiKeyStamper } = await import("@turnkey/api-key-stamper");

      const stamper = new ApiKeyStamper({
        apiPublicKey: config.apiPublicKey,
        apiPrivateKey: config.apiPrivateKey,
      });

      const turnkeySigner = new TurnkeySigner({
        baseUrl: config.apiBaseUrl,
        stamper,
        organizationId: config.organizationId,
        privateKeyId: config.privateKeyId,
      } as any);

      return new TurnkeySignerWrapper(turnkeySigner);
    }

    case 'privy': {
      throw new TTTSignerError(ERROR_CODES.SIGNER_PRIVY_NOT_IMPLEMENTED, "[Signer] Privy signer is not yet implemented. Use 'privateKey' or 'turnkey' instead.", "Privy embedded wallet support is planned but not available in this release.", "Use { type: 'privateKey', key: '0x...' } or { type: 'turnkey', ... } as your signer config.");
    }

    case 'kms': {
      if (config.provider === 'aws') {
        try {
          // @ts-ignore
          const { KMSClient } = await import('@aws-sdk/client-kms');
          const client = new KMSClient({ region: config.region || 'us-east-1' });
          const awsSigner = new AWSKMSEthersSigner(client, config.keyId);
          return new KMSSigner(awsSigner);
        } catch (e) {
          throw new TTTSignerError(ERROR_CODES.SIGNER_KMS_AWS_INIT_FAILED, "[Signer] AWS KMS initialization failed", (e as Error).message, "Ensure @aws-sdk/client-kms is installed and credentials are configured.");
        }
      } else if (config.provider === 'gcp') {
        if (!config.projectId || !config.locationId || !config.keyRingId || !config.keyVersionId) {
          throw new TTTSignerError(ERROR_CODES.SIGNER_KMS_GCP_MISSING_FIELDS, "[Signer] GCP KMS missing required fields", `projectId=${config.projectId}, locationId=${config.locationId}, keyRingId=${config.keyRingId}, keyVersionId=${config.keyVersionId}`, "Provide all required GCP KMS fields: projectId, locationId, keyRingId, keyVersionId.");
        }
        try {
          // @ts-ignore
          const { KeyManagementServiceClient } = await import('@google-cloud/kms');
          const client = new KeyManagementServiceClient();
          const name = client.cryptoKeyVersionPath(
            config.projectId,
            config.locationId,
            config.keyRingId,
            config.keyId,
            config.keyVersionId
          );
          const gcpSigner = new GCPKMSEthersSigner(client, name);
          return new KMSSigner(gcpSigner);
        } catch (e) {
          throw new TTTSignerError(ERROR_CODES.SIGNER_KMS_GCP_INIT_FAILED, "[Signer] GCP KMS initialization failed", (e as Error).message, "Ensure @google-cloud/kms is installed and application default credentials are set.");
        }
      }
      throw new TTTSignerError(ERROR_CODES.SIGNER_KMS_UNSUPPORTED_PROVIDER, "[Signer] Unsupported KMS provider", `Provider: ${config.provider}`, "Use 'aws' or 'gcp'.");
    }

    default:
      // @ts-ignore
      throw new TTTSignerError(ERROR_CODES.SIGNER_UNSUPPORTED_TYPE, `[Signer] Unsupported signer type`, `Type: ${(config as any).type}`, "Provide a supported signer type: privateKey, turnkey, privy, kms.");
  }
}

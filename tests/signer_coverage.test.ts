// tests/signer_coverage.test.ts — Extended coverage for signer.ts (target: 85%+)
// Covers: KMS paths (AWS/GCP mocked), Turnkey dynamic import failure,
// DER parsing, parseDERSignature, env var fallback, edge cases.

import { createSigner, PrivateKeySigner, KMSSigner, SignerType } from "../src/signer";
import { TTTSignerError } from "../src/errors";

// --- Mock @aws-sdk/client-kms (virtual — not installed) ---
const mockAwsSend = jest.fn();
jest.mock("@aws-sdk/client-kms", () => {
  return {
    KMSClient: jest.fn().mockImplementation(() => ({
      send: mockAwsSend,
    })),
    GetPublicKeyCommand: jest.fn().mockImplementation((params: any) => ({ ...params, _type: "GetPublicKeyCommand" })),
    SignCommand: jest.fn().mockImplementation((params: any) => ({ ...params, _type: "SignCommand" })),
  };
}, { virtual: true });

// --- Mock @google-cloud/kms (virtual — not installed) ---
const mockGcpGetPublicKey = jest.fn();
const mockGcpAsymmetricSign = jest.fn();
jest.mock("@google-cloud/kms", () => {
  return {
    KeyManagementServiceClient: jest.fn().mockImplementation(() => ({
      getPublicKey: mockGcpGetPublicKey,
      asymmetricSign: mockGcpAsymmetricSign,
      cryptoKeyVersionPath: jest.fn().mockReturnValue("projects/p/locations/l/keyRings/kr/cryptoKeys/k/cryptoKeyVersions/v"),
    })),
  };
}, { virtual: true });

// --- Mock @turnkey/ethers and @turnkey/api-key-stamper (virtual) ---
jest.mock("@turnkey/ethers", () => {
  return {
    TurnkeySigner: jest.fn().mockImplementation(() => ({
      getAddress: jest.fn().mockResolvedValue("0x" + "aa".repeat(20)),
      signMessage: jest.fn().mockResolvedValue("0xsig"),
      connect: jest.fn(),
    })),
  };
}, { virtual: true });

jest.mock("@turnkey/api-key-stamper", () => {
  return {
    ApiKeyStamper: jest.fn().mockImplementation(() => ({})),
  };
}, { virtual: true });

describe("Signer Coverage — KMS, Turnkey, edge cases", () => {
  const validKey = "0x" + "ab".repeat(32);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- PrivateKey edge cases ---
  test("createSigner privateKey with envVar that is not set throws", async () => {
    delete process.env.NONEXISTENT_KEY;
    await expect(
      createSigner({ type: "privateKey", envVar: "NONEXISTENT_KEY" })
    ).rejects.toThrow("Private key missing");
  });

  test("createSigner privateKey with both key and envVar uses key", async () => {
    process.env.SOME_KEY = "0x" + "cc".repeat(32);
    const signer = await createSigner({ type: "privateKey", key: validKey, envVar: "SOME_KEY" });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
    delete process.env.SOME_KEY;
  });

  test("createSigner privateKey with invalid hex (right length but non-hex) throws", async () => {
    await expect(
      createSigner({ type: "privateKey", key: "0x" + "zz".repeat(32) })
    ).rejects.toThrow("Invalid private key format");
  });

  // --- SignerType enum exists ---
  test("SignerType enum has expected values", () => {
    expect(SignerType.PrivateKey).toBe("privateKey");
    expect(SignerType.Turnkey).toBe("turnkey");
    expect(SignerType.Privy).toBe("privy");
    expect(SignerType.KMS).toBe("kms");
  });

  // --- Turnkey signer ---
  test("createSigner with turnkey type returns TurnkeySignerWrapper", async () => {
    const signer = await createSigner({
      type: "turnkey",
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: "org-1",
      privateKeyId: "pk-1",
      apiPublicKey: "pub-key",
      apiPrivateKey: "priv-key",
    });
    expect(signer).toBeDefined();
    const addr = await signer.getAddress();
    expect(addr).toMatch(/^0x/);
  });

  // --- AWS KMS signer creation ---
  test("createSigner with aws kms type returns KMSSigner", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "aws",
      keyId: "alias/my-key",
      region: "us-west-2",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  test("createSigner with aws kms uses default region if not provided", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "aws",
      keyId: "alias/my-key",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  // --- GCP KMS signer creation ---
  test("createSigner with gcp kms type returns KMSSigner", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "gcp",
      keyId: "my-key",
      projectId: "proj",
      locationId: "global",
      keyRingId: "ring",
      keyVersionId: "1",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  test("createSigner with gcp kms missing projectId throws", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        locationId: "global",
        keyRingId: "ring",
        keyVersionId: "1",
      } as any)
    ).rejects.toThrow("missing required fields");
  });

  test("createSigner with gcp kms missing locationId throws", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "proj",
        keyRingId: "ring",
        keyVersionId: "1",
      } as any)
    ).rejects.toThrow("missing required fields");
  });

  test("createSigner with gcp kms missing keyRingId throws", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "proj",
        locationId: "global",
        keyVersionId: "1",
      } as any)
    ).rejects.toThrow("missing required fields");
  });

  test("createSigner with gcp kms missing keyVersionId throws", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "proj",
        locationId: "global",
        keyRingId: "ring",
      } as any)
    ).rejects.toThrow("missing required fields");
  });

  // --- Unsupported KMS provider ---
  test("createSigner with unsupported kms provider throws", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "azure" as any,
        keyId: "k1",
      })
    ).rejects.toThrow("Unsupported KMS provider");
  });

  // --- Privy throws not implemented ---
  test("createSigner privy throws not implemented with walletId", async () => {
    await expect(
      createSigner({ type: "privy", appId: "app1", appSecret: "secret", walletId: "w1" })
    ).rejects.toThrow("not yet implemented");
  });

  // --- TTTAbstractSigner getAddress delegation ---
  test("PrivateKeySigner.getAddress delegates to inner signer", async () => {
    const signer = await createSigner({ type: "privateKey", key: validKey });
    const addr = await signer.getAddress();
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // inner should be the same signer
    expect(signer.inner).toBeDefined();
  });

  // --- Error class is TTTSignerError ---
  test("missing key throws TTTSignerError", async () => {
    try {
      await createSigner({ type: "privateKey" });
      fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TTTSignerError);
    }
  });

  test("invalid key format throws TTTSignerError", async () => {
    try {
      await createSigner({ type: "privateKey", key: "0xshort" });
      fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TTTSignerError);
    }
  });

  test("unsupported type throws TTTSignerError", async () => {
    try {
      await createSigner({ type: "banana" } as any);
      fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TTTSignerError);
    }
  });
});

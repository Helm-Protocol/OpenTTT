// tests/signer_coverage.test.ts — Mock coverage for all signer types
import { createSigner, SignerConfig, PrivateKeySigner, TurnkeySignerWrapper, PrivySigner, KMSSigner, SignerType, TTTAbstractSigner } from "../src/signer";
import { TTTSignerError } from "../src/errors";

// ── Mock external dependencies ──────────────────────────────────────────────

// Mock @turnkey/ethers
jest.mock("@turnkey/ethers", () => ({
  TurnkeySigner: jest.fn().mockImplementation(() => ({
    getAddress: jest.fn().mockResolvedValue("0x" + "aa".repeat(20)),
    signMessage: jest.fn().mockResolvedValue("0xsig"),
    connect: jest.fn().mockReturnThis(),
  })),
}), { virtual: true });

// Mock @turnkey/api-key-stamper
jest.mock("@turnkey/api-key-stamper", () => ({
  ApiKeyStamper: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

// Mock @aws-sdk/client-kms
const mockKMSSend = jest.fn();
jest.mock("@aws-sdk/client-kms", () => ({
  KMSClient: jest.fn().mockImplementation(() => ({
    send: mockKMSSend,
  })),
  GetPublicKeyCommand: jest.fn().mockImplementation((params: any) => ({ ...params, _type: "GetPublicKeyCommand" })),
  SignCommand: jest.fn().mockImplementation((params: any) => ({ ...params, _type: "SignCommand" })),
}), { virtual: true });

// Mock @google-cloud/kms
const mockGetPublicKey = jest.fn();
const mockAsymmetricSign = jest.fn();
jest.mock("@google-cloud/kms", () => ({
  KeyManagementServiceClient: jest.fn().mockImplementation(() => ({
    getPublicKey: mockGetPublicKey,
    asymmetricSign: mockAsymmetricSign,
    cryptoKeyVersionPath: jest.fn().mockReturnValue("projects/p/locations/l/keyRings/kr/cryptoKeys/k/cryptoKeyVersions/v"),
  })),
}), { virtual: true });

// ── Tests ───────────────────────────────────────────────────────────────────

describe("SignerType enum", () => {
  test("has all 4 types", () => {
    expect(SignerType.PrivateKey).toBe("privateKey");
    expect(SignerType.Turnkey).toBe("turnkey");
    expect(SignerType.Privy).toBe("privy");
    expect(SignerType.KMS).toBe("kms");
  });
});

describe("PrivateKeySigner", () => {
  const validKey = "0x" + "ab".repeat(32);

  test("creates signer with valid hex key", async () => {
    const signer = await createSigner({ type: "privateKey", key: validKey });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
    expect(signer).toBeInstanceOf(TTTAbstractSigner);
  });

  test("getAddress returns valid EVM address", async () => {
    const signer = await createSigner({ type: "privateKey", key: validKey });
    const addr = await signer.getAddress();
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test("inner signer is accessible", async () => {
    const signer = await createSigner({ type: "privateKey", key: validKey });
    expect(signer.inner).toBeDefined();
    expect(typeof signer.inner.getAddress).toBe("function");
  });

  test("auto-prepends 0x to bare hex key", async () => {
    const signer = await createSigner({ type: "privateKey", key: "ab".repeat(32) });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
  });

  test("reads key from environment variable", async () => {
    process.env.__TEST_SIGNER_KEY__ = validKey;
    const signer = await createSigner({ type: "privateKey", envVar: "__TEST_SIGNER_KEY__" });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
    delete process.env.__TEST_SIGNER_KEY__;
  });

  test("throws TTTSignerError when key is missing entirely", async () => {
    await expect(createSigner({ type: "privateKey" })).rejects.toThrow(TTTSignerError);
    await expect(createSigner({ type: "privateKey" })).rejects.toThrow("Private key missing");
  });

  test("throws TTTSignerError when envVar is set but not in env", async () => {
    delete process.env.__NONEXISTENT_KEY__;
    await expect(
      createSigner({ type: "privateKey", envVar: "__NONEXISTENT_KEY__" })
    ).rejects.toThrow(TTTSignerError);
  });

  test("throws TTTSignerError on invalid hex format", async () => {
    await expect(
      createSigner({ type: "privateKey", key: "0xinvalid" })
    ).rejects.toThrow("Invalid private key format");
  });

  test("throws TTTSignerError on too-short key", async () => {
    await expect(
      createSigner({ type: "privateKey", key: "0x" + "ab".repeat(16) })
    ).rejects.toThrow("Invalid private key format");
  });

  test("throws TTTSignerError on too-long key", async () => {
    await expect(
      createSigner({ type: "privateKey", key: "0x" + "ab".repeat(64) })
    ).rejects.toThrow("Invalid private key format");
  });

  test("error has correct code for missing key", async () => {
    try {
      await createSigner({ type: "privateKey" });
      fail("Should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TTTSignerError);
      expect(e.code).toBe("TTT_E011");
    }
  });

  test("error has correct code for invalid format", async () => {
    try {
      await createSigner({ type: "privateKey", key: "0xbad" });
      fail("Should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TTTSignerError);
      expect(e.code).toBe("TTT_E012");
    }
  });
});

describe("TurnkeySigner", () => {
  test("creates TurnkeySignerWrapper with valid config", async () => {
    const signer = await createSigner({
      type: "turnkey",
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: "org-123",
      privateKeyId: "pk-456",
      apiPublicKey: "pub-key",
      apiPrivateKey: "priv-key",
    });
    expect(signer).toBeInstanceOf(TurnkeySignerWrapper);
    expect(signer).toBeInstanceOf(TTTAbstractSigner);
  });

  test("inner signer has getAddress", async () => {
    const signer = await createSigner({
      type: "turnkey",
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: "org-123",
      privateKeyId: "pk-456",
      apiPublicKey: "pub-key",
      apiPrivateKey: "priv-key",
    });
    expect(typeof signer.inner.getAddress).toBe("function");
  });
});

describe("PrivySigner", () => {
  test("throws not-yet-implemented error", async () => {
    await expect(
      createSigner({ type: "privy", appId: "app-123", appSecret: "secret-456" })
    ).rejects.toThrow("not yet implemented");
  });

  test("error has correct code TTT_E014", async () => {
    try {
      await createSigner({ type: "privy", appId: "x", appSecret: "y" });
      fail("Should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TTTSignerError);
      expect(e.code).toBe("TTT_E014");
    }
  });

  test("error message suggests alternatives", async () => {
    await expect(
      createSigner({ type: "privy", appId: "x", appSecret: "y" })
    ).rejects.toThrow(/privateKey.*turnkey/i);
  });

  test("PrivySigner class can be instantiated directly with mock signer", () => {
    const mockSigner = { getAddress: jest.fn().mockResolvedValue("0x" + "bb".repeat(20)) } as any;
    const ps = new PrivySigner(mockSigner);
    expect(ps).toBeInstanceOf(TTTAbstractSigner);
    expect(ps.inner).toBe(mockSigner);
  });
});

describe("KMS Signer — AWS", () => {
  beforeEach(() => {
    mockKMSSend.mockReset();
  });

  test("creates KMSSigner for AWS with valid config", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "aws",
      keyId: "arn:aws:kms:us-east-1:123:key/abc",
      region: "us-east-1",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  test("defaults region to us-east-1 when not specified", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "aws",
      keyId: "test-key-id",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  test("KMSSigner class can wrap any Signer-like object", () => {
    const mockSigner = { getAddress: jest.fn().mockResolvedValue("0x" + "cc".repeat(20)) } as any;
    const ks = new KMSSigner(mockSigner);
    expect(ks).toBeInstanceOf(TTTAbstractSigner);
  });
});

describe("KMS Signer — GCP", () => {
  beforeEach(() => {
    mockGetPublicKey.mockReset();
    mockAsymmetricSign.mockReset();
  });

  test("creates KMSSigner for GCP with all required fields", async () => {
    const signer = await createSigner({
      type: "kms",
      provider: "gcp",
      keyId: "my-key",
      projectId: "my-project",
      locationId: "us-central1",
      keyRingId: "my-keyring",
      keyVersionId: "1",
    });
    expect(signer).toBeInstanceOf(KMSSigner);
  });

  test("throws on missing projectId", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        locationId: "us",
        keyRingId: "kr",
        keyVersionId: "1",
      })
    ).rejects.toThrow("missing required fields");
  });

  test("throws on missing locationId", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "p1",
        keyRingId: "kr",
        keyVersionId: "1",
      })
    ).rejects.toThrow("missing required fields");
  });

  test("throws on missing keyRingId", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "p1",
        locationId: "us",
        keyVersionId: "1",
      })
    ).rejects.toThrow("missing required fields");
  });

  test("throws on missing keyVersionId", async () => {
    await expect(
      createSigner({
        type: "kms",
        provider: "gcp",
        keyId: "k1",
        projectId: "p1",
        locationId: "us",
        keyRingId: "kr",
      })
    ).rejects.toThrow("missing required fields");
  });

  test("GCP missing fields error has correct code TTT_E016", async () => {
    try {
      await createSigner({ type: "kms", provider: "gcp", keyId: "k1" });
      fail("Should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TTTSignerError);
      expect(e.code).toBe("TTT_E016");
    }
  });
});

describe("KMS Signer — Unsupported provider", () => {
  test("throws on unsupported KMS provider", async () => {
    await expect(
      createSigner({ type: "kms", provider: "azure" as any, keyId: "k1" })
    ).rejects.toThrow("Unsupported KMS provider");
  });

  test("unsupported provider error has code TTT_E018", async () => {
    try {
      await createSigner({ type: "kms", provider: "azure" as any, keyId: "k1" });
      fail("Should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("TTT_E018");
    }
  });
});

describe("Unsupported signer type", () => {
  test("throws on completely unknown type", async () => {
    await expect(
      createSigner({ type: "magicwand" } as any)
    ).rejects.toThrow("Unsupported signer type");
  });

  test("error has correct code TTT_E019", async () => {
    try {
      await createSigner({ type: "unknown" } as any);
      fail("Should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("TTT_E019");
    }
  });
});

describe("TTTAbstractSigner — getAddress delegation", () => {
  test("delegates getAddress to inner signer", async () => {
    const expectedAddr = "0x" + "dd".repeat(20);
    const mockInner = { getAddress: jest.fn().mockResolvedValue(expectedAddr) } as any;
    const wrapper = new KMSSigner(mockInner);
    const addr = await wrapper.getAddress();
    expect(addr).toBe(expectedAddr);
    expect(mockInner.getAddress).toHaveBeenCalledTimes(1);
  });
});

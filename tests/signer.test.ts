import { createSigner, SignerConfig, PrivateKeySigner } from "../src/signer";

describe("Signer", () => {
  const validKey = "0x" + "ab".repeat(32);

  it("should create PrivateKeySigner with valid key", async () => {
    const signer = await createSigner({ type: "privateKey", key: validKey });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
    const addr = await signer.getAddress();
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("should auto-prepend 0x to key", async () => {
    const signer = await createSigner({ type: "privateKey", key: "ab".repeat(32) });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
  });

  it("should throw on missing key", async () => {
    await expect(createSigner({ type: "privateKey" }))
      .rejects.toThrow("Private key missing");
  });

  it("should throw on invalid key format", async () => {
    await expect(createSigner({ type: "privateKey", key: "0xinvalid" }))
      .rejects.toThrow("Invalid private key format");
  });

  it("should read key from env var", async () => {
    process.env.TEST_TTT_KEY = validKey;
    const signer = await createSigner({ type: "privateKey", envVar: "TEST_TTT_KEY" });
    expect(signer).toBeInstanceOf(PrivateKeySigner);
    delete process.env.TEST_TTT_KEY;
  });

  it("should throw on unsupported signer type", async () => {
    await expect(createSigner({ type: "unknown" } as any))
      .rejects.toThrow("Unsupported signer type");
  });

  it("should throw on Privy (not implemented)", async () => {
    await expect(createSigner({ type: "privy", appId: "x", appSecret: "y" }))
      .rejects.toThrow("not yet implemented");
  });

  it("should throw on GCP KMS missing fields", async () => {
    await expect(createSigner({
      type: "kms", provider: "gcp", keyId: "k1"
    })).rejects.toThrow("missing required fields");
  });
});

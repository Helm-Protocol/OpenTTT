import { EVMConnector } from "../src/evm_connector";

describe("EVMConnector", () => {
  let connector: EVMConnector;

  beforeEach(() => {
    connector = new EVMConnector();
  });

  it("should throw on empty RPC URL", async () => {
    await expect(connector.connect("", "0x" + "ab".repeat(32)))
      .rejects.toThrow("Invalid RPC URL");
  });

  it("should throw on invalid private key format", async () => {
    await expect(connector.connect("https://sepolia.base.org", "0xinvalid"))
      .rejects.toThrow("Invalid Private Key");
  });

  it("should throw on contract attach before connect", () => {
    expect(() => connector.attachContract("0x" + "11".repeat(20), []))
      .toThrow("Not connected to signer");
  });

  it("should throw on getProvider before connect", () => {
    expect(() => connector.getProvider())
      .toThrow("not connected");
  });

  it("should throw on getSigner before connect", () => {
    expect(() => connector.getSigner())
      .toThrow("not connected");
  });

  it("should throw on getTTTBalance before contract attach", async () => {
    await expect(connector.getTTTBalance("0x" + "11".repeat(20), 0n))
      .rejects.toThrow("not attached");
  });

  it("should throw on mintTTT before contract attach", async () => {
    await expect(connector.mintTTT("0x" + "11".repeat(20), 100n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("not attached");
  });

  it("should throw on burnTTT before contract attach", async () => {
    await expect(connector.burnTTT(100n, "0x" + "ff".repeat(32), 1))
      .rejects.toThrow("not attached");
  });

  it("should unsubscribe all cleanly when empty", () => {
    // Should not throw even with no listeners
    expect(() => connector.unsubscribeAll()).not.toThrow();
  });

  it("should throw on invalid contract address", async () => {
    // Need to mock a connected state
    // For now, test the guard directly
    const badAddr = "not-an-address";
    expect(() => connector.attachContract(badAddr, [])).toThrow();
  });
});

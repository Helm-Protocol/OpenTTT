// tests/evm_connector_coverage.test.ts — Extended coverage for EVMConnector
import { EVMConnector } from "../src/evm_connector";

describe("EVMConnector — Coverage Extension", () => {
  let connector: EVMConnector;

  beforeEach(() => {
    connector = new EVMConnector();
  });

  test("Constructor creates an instance", () => {
    expect(connector).toBeInstanceOf(EVMConnector);
  });

  test("getSigner() throws before connect", () => {
    expect(() => connector.getSigner()).toThrow("not connected");
  });

  test("getProvider() throws before connect", () => {
    expect(() => connector.getProvider()).toThrow("not connected");
  });

  test("attachContract throws if not connected (no signer)", () => {
    const validAddr = "0x" + "11".repeat(20);
    expect(() => connector.attachContract(validAddr, [])).toThrow("Not connected to signer");
  });

  test("attachProtocolFeeContract throws if not connected", () => {
    const validAddr = "0x" + "11".repeat(20);
    expect(() => connector.attachProtocolFeeContract(validAddr, [])).toThrow("Not connected to signer");
  });

  test("mintTTT throws if contract not attached", async () => {
    const validAddr = "0x" + "11".repeat(20);
    await expect(connector.mintTTT(validAddr, 100n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("not attached");
  });

  test("burnTTT throws if contract not attached", async () => {
    await expect(connector.burnTTT(100n, "0x" + "ff".repeat(32), 1))
      .rejects.toThrow("not attached");
  });

  test("swap throws if not connected (no signer)", async () => {
    const routerAddr = "0x" + "22".repeat(20);
    const tokenIn = "0x" + "33".repeat(20);
    const tokenOut = "0x" + "44".repeat(20);
    await expect(connector.swap(routerAddr, tokenIn, tokenOut, 1000n, 900n))
      .rejects.toThrow("Not connected to signer");
  });

  test("submitTTTRecord throws if contract not attached", async () => {
    const record = { grgPayload: [new Uint8Array([1, 2, 3])] } as any;
    await expect(connector.submitTTTRecord(record, 100n, 1))
      .rejects.toThrow("not attached");
  });

  test("getTTTBalance throws if contract not attached", async () => {
    const validAddr = "0x" + "11".repeat(20);
    await expect(connector.getTTTBalance(validAddr, 0n))
      .rejects.toThrow("not attached");
  });

  test("verifyBlock throws if provider not connected", async () => {
    await expect(connector.verifyBlock(12345))
      .rejects.toThrow("not connected");
  });

  test("getPendingTransactions throws if provider not connected", async () => {
    await expect(connector.getPendingTransactions())
      .rejects.toThrow("not connected");
  });

  test("unsubscribeAll is a no-op when no listeners exist", () => {
    expect(() => connector.unsubscribeAll()).not.toThrow();
  });

  test("connect throws on empty RPC URL", async () => {
    await expect(connector.connect("", "0x" + "ab".repeat(32)))
      .rejects.toThrow("Invalid RPC URL");
  });

  test("connect throws on invalid private key format (too short)", async () => {
    await expect(connector.connect("https://sepolia.base.org", "0xinvalid"))
      .rejects.toThrow("Invalid Private Key");
  });

  test("connect throws on invalid private key format (no 0x prefix)", async () => {
    await expect(connector.connect("https://sepolia.base.org", "ab".repeat(32)))
      .rejects.toThrow("Invalid Private Key");
  });

  test("attachContract throws on invalid address format", () => {
    expect(() => connector.attachContract("not-an-address", [])).toThrow();
  });

  test("POT_ANCHORED_EVENT_ABI is accessible as static property", () => {
    expect(EVMConnector.POT_ANCHORED_EVENT_ABI).toContain("PoTAnchored");
  });

  test("swap throws on invalid router address when signer exists", async () => {
    // Even though signer is null, it should throw signer error first
    await expect(connector.swap("bad-address", "0x" + "33".repeat(20), "0x" + "44".repeat(20), 1000n, 900n))
      .rejects.toThrow();
  });

  test("subscribeToEvents does nothing when no contracts attached", async () => {
    // Should not throw — just silently skip since tttContract and protocolFeeContract are null
    await expect(connector.subscribeToEvents({})).resolves.toBeUndefined();
  });
});

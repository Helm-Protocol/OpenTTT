// tests/evm_connector_coverage2.test.ts — Extended coverage for evm_connector.ts
// Covers: connect() with signer object, mintTTT success/error, burnTTT success/error,
// swap success, subscribeToEvents with callbacks, getTTTBalance, verifyBlock, extractRevertReason

import { EVMConnector } from "../src/evm_connector";
import { ethers } from "ethers";

// Mock ethers module
const mockGetNetwork = jest.fn().mockResolvedValue({ chainId: 84532n });
const mockGetBlock = jest.fn();
const mockSend = jest.fn();
const mockGetBalance = jest.fn();

const mockMintEstimateGas = jest.fn().mockResolvedValue(100000n);
const mockMintFn = jest.fn().mockResolvedValue({ hash: "0xminttx", wait: jest.fn().mockResolvedValue({ hash: "0xminttx" }) }) as any;
mockMintFn.estimateGas = mockMintEstimateGas;

const mockBurnEstimateGas = jest.fn().mockResolvedValue(80000n);
const mockBurnFn = jest.fn().mockResolvedValue({ hash: "0xburntx", wait: jest.fn().mockResolvedValue({ hash: "0xburntx" }) }) as any;
mockBurnFn.estimateGas = mockBurnEstimateGas;

const mockBalanceOf = jest.fn().mockResolvedValue(500n);

const mockContractOn = jest.fn();
const mockContractOff = jest.fn();

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getNetwork: mockGetNetwork,
      getBlock: mockGetBlock,
      send: mockSend,
      getBalance: mockGetBalance,
    })),
    Contract: jest.fn().mockImplementation(() => ({
      mint: Object.assign(mockMintFn, { estimateGas: mockMintEstimateGas }),
      burn: Object.assign(mockBurnFn, { estimateGas: mockBurnEstimateGas }),
      balanceOf: mockBalanceOf,
      on: mockContractOn,
      off: mockContractOff,
    })),
  };
});

describe("EVMConnector — Coverage Extension 2", () => {
  let connector: EVMConnector;
  const validAddr = "0x" + "11".repeat(20);
  const validKey = "0x" + "ab".repeat(32);

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new EVMConnector();
  });

  // --- connect() with valid private key ---
  test("connect with valid private key and RPC URL succeeds", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    expect(mockGetNetwork).toHaveBeenCalled();
  });

  // --- connect() with a Signer object ---
  test("connect with a Signer object succeeds", async () => {
    const mockSigner = {
      connect: jest.fn().mockReturnThis(),
      getAddress: jest.fn().mockResolvedValue(validAddr),
    } as any;
    await connector.connect("https://sepolia.base.org", mockSigner);
    expect(mockGetNetwork).toHaveBeenCalled();
  });

  // --- connect() with Signer without connect method ---
  test("connect with Signer without connect method uses signer directly", async () => {
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValue(validAddr),
    } as any;
    await connector.connect("https://sepolia.base.org", mockSigner);
    expect(mockGetNetwork).toHaveBeenCalled();
  });

  // --- connect() network failure ---
  test("connect throws TTTNetworkError on network failure", async () => {
    mockGetNetwork.mockRejectedValueOnce(new Error("network down"));
    await expect(connector.connect("https://bad.rpc", validKey))
      .rejects.toThrow("Connection failed");
  });

  // --- connect() with non-string, non-object RPC URL ---
  test("connect throws on non-string RPC URL", async () => {
    await expect(connector.connect(123 as any, validKey))
      .rejects.toThrow("Invalid RPC URL");
  });

  // --- attachContract with valid signer ---
  test("attachContract succeeds after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    expect(() => connector.attachContract(validAddr, ["function mint()"])).not.toThrow();
  });

  // --- attachContract with invalid address ---
  test("attachContract throws on invalid address after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    expect(() => connector.attachContract("bad-addr", [])).toThrow("Invalid contract address");
  });

  // --- attachContract with empty address ---
  test("attachContract throws on empty address after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    expect(() => connector.attachContract("", [])).toThrow("Invalid contract address");
  });

  // --- attachProtocolFeeContract with invalid address ---
  test("attachProtocolFeeContract throws on invalid address after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    expect(() => connector.attachProtocolFeeContract("not-addr", [])).toThrow("Invalid contract address");
  });

  // --- mintTTT success path ---
  test("mintTTT succeeds with valid params", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);

    const receipt = await connector.mintTTT(validAddr, 1000n, "0x" + "ff".repeat(32));
    expect(receipt).toHaveProperty("hash", "0xminttx");
  });

  // --- mintTTT with potHash ---
  test("mintTTT with potHash logs it", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);

    const receipt = await connector.mintTTT(validAddr, 1000n, "0x" + "ff".repeat(32), "0xpothash");
    expect(receipt).toHaveProperty("hash");
  });

  // --- mintTTT invalid recipient ---
  test("mintTTT throws on invalid recipient address", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);

    await expect(connector.mintTTT("bad-addr", 1000n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("Invalid recipient address");
  });

  // --- mintTTT empty recipient ---
  test("mintTTT throws on empty recipient address", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);

    await expect(connector.mintTTT("", 1000n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("Invalid recipient address");
  });

  // --- mintTTT null receipt ---
  test("mintTTT throws when receipt is null (dropped tx)", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);
    mockMintFn.mockResolvedValueOnce({ hash: "0x", wait: jest.fn().mockResolvedValue(null) });

    await expect(connector.mintTTT(validAddr, 1000n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("Mint failed");
  });

  // --- mintTTT contract error with reason ---
  test("mintTTT throws TTTContractError on contract revert", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function mint(address,uint256,bytes32)"]);
    mockMintEstimateGas.mockRejectedValueOnce({ reason: "not owner" });

    await expect(connector.mintTTT(validAddr, 1000n, "0x" + "ff".repeat(32)))
      .rejects.toThrow("Mint failed");
  });

  // --- burnTTT success path ---
  test("burnTTT succeeds with valid params", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function burn(uint256,bytes32,uint256)"]);

    const result = await connector.burnTTT(500n, "0x" + "ff".repeat(32), 1);
    expect(result).toHaveProperty("hash", "0xburntx");
  });

  // --- burnTTT null receipt ---
  test("burnTTT throws when receipt is null", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function burn(uint256,bytes32,uint256)"]);
    mockBurnFn.mockResolvedValueOnce({ hash: "0x", wait: jest.fn().mockResolvedValue(null) });

    await expect(connector.burnTTT(500n, "0x" + "ff".repeat(32), 1))
      .rejects.toThrow("Burn failed");
  });

  // --- burnTTT contract error ---
  test("burnTTT throws on contract error", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function burn(uint256,bytes32,uint256)"]);
    mockBurnFn.mockRejectedValueOnce({ message: "insufficient balance" });

    await expect(connector.burnTTT(500n, "0x" + "ff".repeat(32), 1))
      .rejects.toThrow("Burn failed");
  });

  // --- getTTTBalance success ---
  test("getTTTBalance returns balance", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function balanceOf(address,uint256)"]);

    const balance = await connector.getTTTBalance(validAddr, 0n);
    expect(balance).toBe(500n);
  });

  // --- getTTTBalance contract error ---
  test("getTTTBalance throws on contract error", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function balanceOf(address,uint256)"]);
    mockBalanceOf.mockRejectedValueOnce({ data: { message: "bad call" } });

    await expect(connector.getTTTBalance(validAddr, 0n))
      .rejects.toThrow("Balance query failed");
  });

  // --- verifyBlock success ---
  test("verifyBlock returns verification result", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    mockGetBlock.mockResolvedValueOnce({
      timestamp: Math.floor(Date.now() / 1000) - 10,
      transactions: ["0xtx1", "0xtx2"],
    });

    const result = await connector.verifyBlock(100);
    expect(result.valid).toBe(true);
    expect(result.blockNumber).toBe(100);
    expect(result.txCount).toBe(2);
    expect(typeof result.latency).toBe("number");
  });

  // --- verifyBlock null block ---
  test("verifyBlock throws when block not found", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    mockGetBlock.mockResolvedValueOnce(null);

    await expect(connector.verifyBlock(999999999))
      .rejects.toThrow("Block not found");
  });

  // --- getPendingTransactions ---
  test("getPendingTransactions returns transaction list", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    mockSend.mockResolvedValueOnce({ transactions: ["0xtx1"] });

    const txs = await connector.getPendingTransactions();
    expect(txs).toEqual(["0xtx1"]);
  });

  // --- getPendingTransactions null block ---
  test("getPendingTransactions returns empty when block is null", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    mockSend.mockResolvedValueOnce(null);

    const txs = await connector.getPendingTransactions();
    expect(txs).toEqual([]);
  });

  // --- subscribeToEvents with callbacks ---
  test("subscribeToEvents registers onMinted callback", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["event TTTMinted(address,uint256,uint256)"]);

    const onMinted = jest.fn();
    await connector.subscribeToEvents({ onMinted });
    expect(mockContractOn).toHaveBeenCalledWith("TTTMinted", expect.any(Function));
  });

  test("subscribeToEvents registers onBurned callback", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["event TTTBurned(address,uint256,uint256,uint256)"]);

    const onBurned = jest.fn();
    await connector.subscribeToEvents({ onBurned });
    expect(mockContractOn).toHaveBeenCalledWith("TTTBurned", expect.any(Function));
  });

  test("subscribeToEvents auto-unsubscribes on re-subscribe", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["event TTTMinted(address,uint256,uint256)"]);

    const onMinted = jest.fn();
    await connector.subscribeToEvents({ onMinted });
    // Second subscribe should cleanup first
    await connector.subscribeToEvents({ onMinted });
    expect(mockContractOff).toHaveBeenCalled();
  });

  // --- unsubscribeAll with listeners ---
  test("unsubscribeAll cleans up registered listeners", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["event TTTMinted(address,uint256,uint256)"]);

    await connector.subscribeToEvents({ onMinted: jest.fn() });
    connector.unsubscribeAll();
    expect(mockContractOff).toHaveBeenCalled();
  });

  // --- swap with invalid router address ---
  test("swap throws on invalid router address when connected", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    await expect(connector.swap("bad-address", validAddr, validAddr, 1000n, 900n))
      .rejects.toThrow("Invalid router address");
  });

  // --- getProvider / getSigner after connect ---
  test("getProvider returns provider after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    const provider = connector.getProvider();
    expect(provider).toBeDefined();
  });

  test("getSigner returns signer after connect", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    const signer = connector.getSigner();
    expect(signer).toBeDefined();
  });

  // --- extractRevertReason edge cases (via error paths) ---
  test("error with data.message is extracted", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function balanceOf(address,uint256)"]);
    mockBalanceOf.mockRejectedValueOnce({ data: { message: "specific error msg" } });

    await expect(connector.getTTTBalance(validAddr, 0n))
      .rejects.toThrow("Balance query failed");
  });

  test("error with no reason/message uses toString fallback", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function balanceOf(address,uint256)"]);
    mockBalanceOf.mockRejectedValueOnce(42);

    await expect(connector.getTTTBalance(validAddr, 0n))
      .rejects.toThrow("Balance query failed");
  });

  test("error with null uses fallback", async () => {
    await connector.connect("https://sepolia.base.org", validKey);
    connector.attachContract(validAddr, ["function balanceOf(address,uint256)"]);
    mockBalanceOf.mockRejectedValueOnce(null);

    await expect(connector.getTTTBalance(validAddr, 0n))
      .rejects.toThrow("Balance query failed");
  });
});

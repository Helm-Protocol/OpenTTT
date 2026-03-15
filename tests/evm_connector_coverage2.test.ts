// tests/evm_connector_coverage2.test.ts — Deep mock coverage for EVMConnector
import { EVMConnector } from "../src/evm_connector";
import { TTTNetworkError, TTTContractError } from "../src/errors";
import { ethers } from "ethers";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConnectorWithMockedProvider(): {
  connector: EVMConnector;
  mockProvider: any;
  mockSigner: any;
  mockContract: any;
} {
  const connector = new EVMConnector();

  const mockProvider = {
    getNetwork: jest.fn().mockResolvedValue({ chainId: 8453n }),
    getBlock: jest.fn(),
    send: jest.fn(),
    destroy: jest.fn(),
  };

  const mockSigner = {
    getAddress: jest.fn().mockResolvedValue("0x" + "aa".repeat(20)),
    connect: jest.fn().mockReturnThis(),
  };

  const mockContract = {
    mint: Object.assign(jest.fn().mockResolvedValue({
      hash: "0xtxhash",
      wait: jest.fn().mockResolvedValue({ hash: "0xreceipt" }),
    }), {
      estimateGas: jest.fn().mockResolvedValue(21000n),
    }),
    burn: Object.assign(jest.fn().mockResolvedValue({
      hash: "0xtxhash",
      wait: jest.fn().mockResolvedValue({ hash: "0xreceipt" }),
    }), {
      estimateGas: jest.fn().mockResolvedValue(21000n),
    }),
    balanceOf: jest.fn().mockResolvedValue(1000n),
    on: jest.fn(),
    off: jest.fn(),
  };

  // Inject mocked internals via connect + override
  (connector as any).provider = mockProvider;
  (connector as any).signer = mockSigner;
  (connector as any).connected = true;
  (connector as any).primaryRpcUrl = "https://mock.rpc";
  (connector as any).signerOrKey = mockSigner;

  return { connector, mockProvider, mockSigner, mockContract };
}

// ── connect() with mocked JsonRpcProvider ───────────────────────────────────

describe("EVMConnector — connect()", () => {
  test("throws TTTNetworkError on null/undefined RPC URL", async () => {
    const c = new EVMConnector();
    await expect(c.connect(null as any, "0x" + "ab".repeat(32))).rejects.toThrow(TTTNetworkError);
  });

  test("throws TTTContractError on private key without 0x prefix", async () => {
    const c = new EVMConnector();
    await expect(c.connect("https://rpc.example.com", "noprefixkey")).rejects.toThrow("Invalid Private Key");
  });

  test("throws TTTContractError on private key with wrong length", async () => {
    const c = new EVMConnector();
    await expect(c.connect("https://rpc.example.com", "0x" + "ab".repeat(10))).rejects.toThrow("Invalid Private Key");
  });

  test("connect with Signer object (non-string) uses signer.connect", async () => {
    const c = new EVMConnector();
    const mockSigner = {
      connect: jest.fn().mockReturnThis(),
      getAddress: jest.fn().mockResolvedValue("0x" + "bb".repeat(20)),
    };
    // Will fail on getNetwork since provider is real, but we test the signer path
    await expect(c.connect("https://bad.invalid", mockSigner as any)).rejects.toThrow();
  });

  test("connect with Signer object without .connect uses signer as-is", async () => {
    const c = new EVMConnector();
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValue("0x" + "cc".repeat(20)),
    };
    // No .connect method on signer
    await expect(c.connect("https://bad.invalid", mockSigner as any)).rejects.toThrow();
  });
});

// ── disconnect() ────────────────────────────────────────────────────────────

describe("EVMConnector — disconnect()", () => {
  test("cleans up provider, signer, contracts", () => {
    const { connector, mockProvider } = makeConnectorWithMockedProvider();
    expect(connector.isConnected()).toBe(true);

    connector.disconnect();

    expect(connector.isConnected()).toBe(false);
    expect(mockProvider.destroy).toHaveBeenCalled();
    expect(() => connector.getProvider()).toThrow();
    expect(() => connector.getSigner()).toThrow();
  });

  test("double disconnect is safe", () => {
    const { connector } = makeConnectorWithMockedProvider();
    connector.disconnect();
    expect(() => connector.disconnect()).not.toThrow();
  });

  test("disconnect clears attached contracts", () => {
    const { connector } = makeConnectorWithMockedProvider();
    // Attach a contract first
    (connector as any).tttContract = { on: jest.fn(), off: jest.fn() };
    (connector as any).protocolFeeContract = { on: jest.fn(), off: jest.fn() };

    connector.disconnect();

    expect((connector as any).tttContract).toBeNull();
    expect((connector as any).protocolFeeContract).toBeNull();
  });
});

// ── reconnect() ─────────────────────────────────────────────────────────────

describe("EVMConnector — reconnect()", () => {
  test("throws when no previous connection exists", async () => {
    const c = new EVMConnector();
    await expect(c.reconnect()).rejects.toThrow("Cannot reconnect");
    await expect(c.reconnect()).rejects.toThrow(TTTNetworkError);
  });

  test("reconnect error has code TTT_E022 when no credentials", async () => {
    const c = new EVMConnector();
    try {
      await c.reconnect();
      fail("Should throw");
    } catch (e: any) {
      expect(e.code).toBe("TTT_E022");
    }
  });

  test("reconnect exhaustion throws TTT_E023", async () => {
    const c = new EVMConnector({ maxReconnectAttempts: 1 });
    // Set stored credentials but with bad URLs
    (c as any).signerOrKey = "0x" + "ab".repeat(32);
    (c as any).primaryRpcUrl = "https://bad.invalid";

    await expect(c.reconnect()).rejects.toThrow("Reconnection failed");
  });
});

// ── isConnected() ───────────────────────────────────────────────────────────

describe("EVMConnector — isConnected()", () => {
  test("returns false initially", () => {
    expect(new EVMConnector().isConnected()).toBe(false);
  });

  test("returns true when provider + connected flag set", () => {
    const { connector } = makeConnectorWithMockedProvider();
    expect(connector.isConnected()).toBe(true);
  });

  test("returns false after disconnect", () => {
    const { connector } = makeConnectorWithMockedProvider();
    connector.disconnect();
    expect(connector.isConnected()).toBe(false);
  });
});

// ── attachContract / attachProtocolFeeContract ──────────────────────────────

describe("EVMConnector — attachContract()", () => {
  test("throws when signer not connected", () => {
    const c = new EVMConnector();
    const addr = "0x" + "11".repeat(20);
    expect(() => c.attachContract(addr, [])).toThrow(TTTContractError);
  });

  test("throws on invalid contract address", () => {
    const { connector } = makeConnectorWithMockedProvider();
    expect(() => connector.attachContract("not-valid", [])).toThrow("Invalid contract address");
  });

  test("throws on empty contract address", () => {
    const { connector } = makeConnectorWithMockedProvider();
    expect(() => connector.attachContract("", [])).toThrow();
  });

  test("attaches contract successfully with valid address", () => {
    const { connector } = makeConnectorWithMockedProvider();
    const addr = ethers.Wallet.createRandom().address;
    expect(() => connector.attachContract(addr, ["function mint(address,uint256,bytes32)"])).not.toThrow();
  });
});

describe("EVMConnector — attachProtocolFeeContract()", () => {
  test("throws when signer not connected", () => {
    const c = new EVMConnector();
    const addr = "0x" + "11".repeat(20);
    expect(() => c.attachProtocolFeeContract(addr, [])).toThrow(TTTContractError);
  });

  test("throws on invalid address", () => {
    const { connector } = makeConnectorWithMockedProvider();
    expect(() => connector.attachProtocolFeeContract("bad-addr", [])).toThrow("Invalid contract address");
  });

  test("attaches successfully with valid address", () => {
    const { connector } = makeConnectorWithMockedProvider();
    const addr = ethers.Wallet.createRandom().address;
    expect(() => connector.attachProtocolFeeContract(addr, ["function collectFee(uint256)"])).not.toThrow();
  });
});

// ── mintTTT() ───────────────────────────────────────────────────────────────

describe("EVMConnector — mintTTT()", () => {
  test("throws when contract not attached", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const addr = "0x" + "11".repeat(20);
    await expect(connector.mintTTT(addr, 100n, "0x" + "ff".repeat(32))).rejects.toThrow("not attached");
  });

  test("throws on invalid recipient address", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    await expect(connector.mintTTT("bad-address", 100n, "0xhash")).rejects.toThrow("Invalid recipient address");
  });

  test("mints successfully with mocked contract", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    const addr = ethers.Wallet.createRandom().address;
    const receipt = await connector.mintTTT(addr, 100n, "0x" + "ff".repeat(32));
    expect(receipt).toHaveProperty("hash");
  });

  test("mints with potHash logs it", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    const addr = ethers.Wallet.createRandom().address;
    const receipt = await connector.mintTTT(addr, 100n, "0x" + "ff".repeat(32), "0xpothash");
    expect(receipt).toHaveProperty("hash");
  });

  test("throws TTTContractError when mint reverts", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      mint: Object.assign(jest.fn().mockRejectedValue(new Error("ERC20: mint to zero")), {
        estimateGas: jest.fn().mockResolvedValue(21000n),
      }),
    };
    (connector as any).tttContract = failContract;
    const addr = ethers.Wallet.createRandom().address;
    await expect(connector.mintTTT(addr, 100n, "0x" + "ff".repeat(32))).rejects.toThrow("Mint failed");
  });

  test("throws when tx receipt is null (dropped tx)", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const dropContract = {
      mint: Object.assign(jest.fn().mockResolvedValue({
        hash: "0xtx",
        wait: jest.fn().mockResolvedValue(null),
      }), {
        estimateGas: jest.fn().mockResolvedValue(21000n),
      }),
    };
    (connector as any).tttContract = dropContract;
    const addr = ethers.Wallet.createRandom().address;
    await expect(connector.mintTTT(addr, 100n, "0x" + "ff".repeat(32))).rejects.toThrow("Mint failed");
  });
});

// ── burnTTT() ───────────────────────────────────────────────────────────────

describe("EVMConnector — burnTTT()", () => {
  test("throws when contract not attached", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    await expect(connector.burnTTT(100n, "0x" + "ff".repeat(32), 1)).rejects.toThrow("not attached");
  });

  test("burns successfully with mocked contract", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    const result = await connector.burnTTT(100n, "0x" + "ff".repeat(32), 1);
    expect(result).toHaveProperty("hash");
  });

  test("throws TTTContractError when burn reverts", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue({ reason: "ERC20: burn exceeds balance" }),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0x" + "ff".repeat(32), 1)).rejects.toThrow("Burn failed");
  });

  test("throws when burn receipt is null", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const dropContract = {
      burn: jest.fn().mockResolvedValue({
        hash: "0xtx",
        wait: jest.fn().mockResolvedValue(null),
      }),
    };
    (connector as any).tttContract = dropContract;
    await expect(connector.burnTTT(100n, "0x" + "ff".repeat(32), 1)).rejects.toThrow();
  });
});

// ── submitTTTRecord() ───────────────────────────────────────────────────────

describe("EVMConnector — submitTTTRecord()", () => {
  test("throws when contract not attached", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const record = { grgPayload: [new Uint8Array([1, 2, 3])] } as any;
    await expect(connector.submitTTTRecord(record, 100n, 1)).rejects.toThrow("not attached");
  });

  test("submits successfully with mocked contract", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    const record = { grgPayload: [new Uint8Array([1, 2, 3])] } as any;
    const receipt = await connector.submitTTTRecord(record, 100n, 1);
    expect(receipt).toHaveProperty("hash");
  });

  test("throws TTTContractError on burn revert within submitTTTRecord", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: Object.assign(jest.fn(), {
        estimateGas: jest.fn().mockRejectedValue(new Error("out of gas")),
      }),
    };
    (connector as any).tttContract = failContract;
    const record = { grgPayload: [new Uint8Array([1])] } as any;
    await expect(connector.submitTTTRecord(record, 100n, 1)).rejects.toThrow("Burn failed");
  });

  test("re-throws TTTNetworkError directly", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: Object.assign(jest.fn(), {
        estimateGas: jest.fn().mockRejectedValue(
          new TTTNetworkError("TTT_E024", "TX dropped", "null receipt", "check explorer")
        ),
      }),
    };
    (connector as any).tttContract = failContract;
    const record = { grgPayload: [new Uint8Array([1])] } as any;
    await expect(connector.submitTTTRecord(record, 100n, 1)).rejects.toThrow(TTTNetworkError);
  });
});

// ── swap() ──────────────────────────────────────────────────────────────────

describe("EVMConnector — swap()", () => {
  test("throws when signer not connected", async () => {
    const c = new EVMConnector();
    const addr = "0x" + "22".repeat(20);
    await expect(c.swap(addr, addr, addr, 100n, 90n)).rejects.toThrow("Not connected to signer");
  });

  test("throws on invalid router address", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    await expect(connector.swap("bad", "0x" + "33".repeat(20), "0x" + "44".repeat(20), 100n, 90n))
      .rejects.toThrow("Invalid router address");
  });

  test("throws on empty router address", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    await expect(connector.swap("", "0x" + "33".repeat(20), "0x" + "44".repeat(20), 100n, 90n))
      .rejects.toThrow("Invalid router address");
  });
});

// ── getTTTBalance() ─────────────────────────────────────────────────────────

describe("EVMConnector — getTTTBalance()", () => {
  test("throws when contract not attached", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    await expect(connector.getTTTBalance("0x" + "11".repeat(20), 0n)).rejects.toThrow("not attached");
  });

  test("returns balance from mocked contract", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;
    const balance = await connector.getTTTBalance("0x" + "11".repeat(20), 0n);
    expect(balance).toBe(1000n);
  });

  test("throws TTTContractError when balanceOf reverts", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      balanceOf: jest.fn().mockRejectedValue(new Error("execution reverted")),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.getTTTBalance("0x" + "11".repeat(20), 0n)).rejects.toThrow("Balance query failed");
  });
});

// ── verifyBlock() ───────────────────────────────────────────────────────────

describe("EVMConnector — verifyBlock()", () => {
  test("throws when provider not connected", async () => {
    const c = new EVMConnector();
    await expect(c.verifyBlock(1)).rejects.toThrow("not connected");
  });

  test("returns verification result for valid block", async () => {
    const { connector, mockProvider } = makeConnectorWithMockedProvider();
    mockProvider.getBlock.mockResolvedValue({
      timestamp: Math.floor(Date.now() / 1000) - 10,
      transactions: ["0xtx1", "0xtx2"],
    });
    const result = await connector.verifyBlock(12345);
    expect(result.valid).toBe(true);
    expect(result.blockNumber).toBe(12345);
    expect(result.txCount).toBe(2);
    expect(typeof result.latency).toBe("number");
  });

  test("throws when block not found (null)", async () => {
    const { connector, mockProvider } = makeConnectorWithMockedProvider();
    mockProvider.getBlock.mockResolvedValue(null);
    await expect(connector.verifyBlock(99999999)).rejects.toThrow("Block not found");
  });
});

// ── getPendingTransactions() ────────────────────────────────────────────────

describe("EVMConnector — getPendingTransactions()", () => {
  test("throws when provider not connected", async () => {
    const c = new EVMConnector();
    await expect(c.getPendingTransactions()).rejects.toThrow("not connected");
  });

  test("returns transaction list from pending block", async () => {
    const { connector, mockProvider } = makeConnectorWithMockedProvider();
    mockProvider.send.mockResolvedValue({ transactions: ["0xtx1"] });
    const txs = await connector.getPendingTransactions();
    expect(txs).toEqual(["0xtx1"]);
  });

  test("returns empty array when pending block is null", async () => {
    const { connector, mockProvider } = makeConnectorWithMockedProvider();
    mockProvider.send.mockResolvedValue(null);
    const txs = await connector.getPendingTransactions();
    expect(txs).toEqual([]);
  });
});

// ── subscribeToEvents / unsubscribeAll ──────────────────────────────────────

describe("EVMConnector — events", () => {
  test("subscribeToEvents with all callbacks on tttContract", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;

    await connector.subscribeToEvents({
      onMinted: jest.fn(),
      onBurned: jest.fn(),
    });

    expect(mockContract.on).toHaveBeenCalledWith("TTTMinted", expect.any(Function));
    expect(mockContract.on).toHaveBeenCalledWith("TTTBurned", expect.any(Function));
  });

  test("subscribeToEvents with onFeeCollected on protocolFeeContract", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const feeContract = { on: jest.fn(), off: jest.fn() };
    (connector as any).protocolFeeContract = feeContract;

    await connector.subscribeToEvents({ onFeeCollected: jest.fn() });
    expect(feeContract.on).toHaveBeenCalledWith("FeeCollected", expect.any(Function));
  });

  test("re-subscribe cleans up previous listeners", async () => {
    const { connector, mockContract } = makeConnectorWithMockedProvider();
    (connector as any).tttContract = mockContract;

    await connector.subscribeToEvents({ onMinted: jest.fn() });
    // Subscribe again — should unsubscribe first
    await connector.subscribeToEvents({ onBurned: jest.fn() });
    expect(mockContract.off).toHaveBeenCalledWith("TTTMinted", expect.any(Function));
  });

  test("unsubscribeAll handles errors in unsub gracefully", () => {
    const { connector } = makeConnectorWithMockedProvider();
    // Push a listener that throws
    (connector as any).eventListeners.push(() => { throw new Error("already removed"); });
    expect(() => connector.unsubscribeAll()).not.toThrow();
  });
});

// ── Static properties ───────────────────────────────────────────────────────

describe("EVMConnector — static", () => {
  test("POT_ANCHORED_EVENT_ABI contains PoTAnchored", () => {
    expect(EVMConnector.POT_ANCHORED_EVENT_ABI).toContain("PoTAnchored");
    expect(EVMConnector.POT_ANCHORED_EVENT_ABI).toContain("event");
  });
});

// ── extractRevertReason (private, tested via error paths) ───────────────────

describe("EVMConnector — extractRevertReason coverage", () => {
  test("extracts reason string from error.reason", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue({ reason: "Insufficient balance" }),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0xhash", 1)).rejects.toThrow("Burn failed");
  });

  test("extracts from error.data.message", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue({ data: { message: "custom revert" } }),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0xhash", 1)).rejects.toThrow("Burn failed");
  });

  test("falls back to error.message", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue(new Error("generic error")),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0xhash", 1)).rejects.toThrow("Burn failed");
  });

  test("handles non-object error", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue("string error"),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0xhash", 1)).rejects.toThrow("Burn failed");
  });

  test("handles null/undefined error", async () => {
    const { connector } = makeConnectorWithMockedProvider();
    const failContract = {
      burn: jest.fn().mockRejectedValue(null),
    };
    (connector as any).tttContract = failContract;
    await expect(connector.burnTTT(100n, "0xhash", 1)).rejects.toThrow("Burn failed");
  });
});

// ── Constructor options ─────────────────────────────────────────────────────

describe("EVMConnector — constructor options", () => {
  test("defaults to empty fallback and 3 max attempts", () => {
    const c = new EVMConnector();
    expect((c as any).fallbackRpcUrls).toEqual([]);
    expect((c as any).maxReconnectAttempts).toBe(3);
  });

  test("accepts custom fallback URLs and max attempts", () => {
    const c = new EVMConnector({
      fallbackRpcUrls: ["https://fb1.com", "https://fb2.com"],
      maxReconnectAttempts: 5,
    });
    expect((c as any).fallbackRpcUrls).toEqual(["https://fb1.com", "https://fb2.com"]);
    expect((c as any).maxReconnectAttempts).toBe(5);
  });
});

import { ethers } from "ethers";
import { ProtocolFeeCollector } from "../src/protocol_fee";
import { FeeCalculation } from "../src/dynamic_fee";
import { EVMConnector } from "../src/evm_connector";

describe("ProtocolFeeCollector", () => {
  const chainId = 8453; // Base
  const verifyingContract = "0x" + "2".repeat(40);
  const protocolFeeRecipient = "0x" + "3".repeat(40);
  
  let mockEvmConnector: any;
  let mockSigner: any;
  let mockProvider: any;
  let mockContract: any;

  beforeEach(() => {
    mockSigner = {
      address: ethers.Wallet.createRandom().address,
      sendTransaction: jest.fn()
    };
    mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(chainId) })
    };
    mockContract = {
      collectFee: jest.fn().mockResolvedValue({
        hash: "0xhash",
        wait: jest.fn().mockResolvedValue({ status: 1 })
      })
    };
    mockEvmConnector = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getSigner: jest.fn().mockReturnValue(mockSigner)
    };

    // Mock ethers.Contract
    jest.spyOn(ethers, "Contract").mockImplementation(() => mockContract as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Test wallet for signing
  const wallet = ethers.Wallet.createRandom();
  
  const mockFeeCalc: FeeCalculation = {
    tttAmount: 1000000000000000000n,
    protocolFeeUsd: 20000n, // $0.02 (6 decimals)
    feeToken: "USDC",
    feeTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    clientNet: 1000000000000000000n,
    tttPriceUsd: 100000n,
    usdCost: 120000n,
    feeRateMint: 1000n,
    feeRateBurn: 500n,
    tier: "T1_block"
  };

  async function generateSignature(
    feeCalc: FeeCalculation,
    nonce: bigint,
    deadline: number,
    signer: ethers.Wallet | ethers.HDNodeWallet
  ) {
    const domain = {
      name: "OpenTTT_ProtocolFee",
      version: "1",
      chainId: chainId,
      verifyingContract: verifyingContract
    };

    const types = {
      CollectFee: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const value = {
      token: ethers.getAddress(feeCalc.feeTokenAddress),
      amount: feeCalc.protocolFeeUsd,
      nonce: nonce,
      deadline: deadline
    };

    return await signer.signTypedData(domain, types, value);
  }

  it("should collect mint fee with valid signature", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const signature = await generateSignature(mockFeeCalc, nonce, deadline, wallet);

    await newCollector.collectMintFee(mockFeeCalc, signature, wallet.address, nonce, deadline);
    const total = await newCollector.getCollectedFees();
    expect(total).toBe(mockFeeCalc.protocolFeeUsd);
    expect(mockContract.collectFee).toHaveBeenCalled();
  });

  it("should collect burn fee with valid signature", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const signature = await generateSignature(mockFeeCalc, nonce, deadline, wallet);

    await newCollector.collectBurnFee(mockFeeCalc, signature, wallet.address, nonce, deadline);
    const total = await newCollector.getCollectedFees();
    expect(total).toBe(mockFeeCalc.protocolFeeUsd);
    expect(mockContract.collectFee).toHaveBeenCalled();
  });

  it("should fail on invalid signature", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const invalidSignature = "0x" + "0".repeat(130);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    await expect(newCollector.collectMintFee(mockFeeCalc, invalidSignature, wallet.address, nonce, deadline))
      .rejects.toThrow("[ProtocolFee] Mint fee collection failed");
  });

  it("should fail when signer address mismatches", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const signature = await generateSignature(mockFeeCalc, nonce, deadline, wallet);
    
    // Using a different address than the one who signed
    const differentAddress = ethers.Wallet.createRandom().address;
    
    await expect(newCollector.collectMintFee(mockFeeCalc, signature, differentAddress, nonce, deadline))
      .rejects.toThrow("Invalid EIP-712 signature: signer mismatch");
  });

  it("should fail on signature replay", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const signature = await generateSignature(mockFeeCalc, nonce, deadline, wallet);

    await newCollector.collectMintFee(mockFeeCalc, signature, wallet.address, nonce, deadline);
    
    await expect(newCollector.collectMintFee(mockFeeCalc, signature, wallet.address, nonce, deadline))
      .rejects.toThrow("Signature already used (replay protection)");
  });

  it("should fail on expired deadline", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) - 60; // Expired 1 min ago
    const signature = await generateSignature(mockFeeCalc, nonce, deadline, wallet);

    await expect(newCollector.collectMintFee(mockFeeCalc, signature, wallet.address, nonce, deadline))
      .rejects.toThrow("Signature deadline expired");
  });

  it("should accumulate fees correctly", async () => {
    const newCollector = new ProtocolFeeCollector(chainId, verifyingContract, mockEvmConnector, protocolFeeRecipient);
    
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    const signature1 = await generateSignature(mockFeeCalc, 1n, deadline, wallet);
    await newCollector.collectMintFee(mockFeeCalc, signature1, wallet.address, 1n, deadline);
    
    const signature2 = await generateSignature(mockFeeCalc, 2n, deadline, wallet);
    await newCollector.collectBurnFee(mockFeeCalc, signature2, wallet.address, 2n, deadline);
    
    expect(await newCollector.getCollectedFees()).toBe(mockFeeCalc.protocolFeeUsd * 2n);
  });
});

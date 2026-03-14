// sdk/tests/integration.test.ts — E2E Integration Flow

import { ethers } from "ethers";
import { TimeSynthesis } from "../src/time_synthesis";
import { AutoMintEngine } from "../src/auto_mint";
import { TTTBuilder } from "../src/ttt_builder";
import { PoolRegistry } from "../src/pool_registry";
import { UniswapV4Hook } from "../src/v4_hook";
import { ProtocolFeeCollector } from "../src/protocol_fee";
import { EVMConnector } from "../src/evm_connector";
import { BeforeSwapParams, AfterSwapParams, TierType } from "../src/types";

describe("Full E2E Integration Flow", () => {
  let autoMintEngine: AutoMintEngine;
  let tttBuilder: TTTBuilder;
  let poolRegistry: PoolRegistry;
  let v4Hook: UniswapV4Hook;
  let feeCollector: ProtocolFeeCollector;
  
  const chainId = 84532; // Base Sepolia
  const poolAddress = "0x1111111111111111111111111111111111111111";
  const hookAddress = "0x2222222222222222222222222222222222222222";
  const tttTokenAddress = "0x3333333333333333333333333333333333333333";
  const privateKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const userAddress = new ethers.Wallet(privateKey).address;

  beforeAll(async () => {
    poolRegistry = new PoolRegistry();
    await poolRegistry.registerPool(chainId, poolAddress);

    autoMintEngine = new AutoMintEngine({
      chainId,
      poolAddress,
      rpcUrl: "http://localhost:8545", // Dummy RPC
      privateKey,
      contractAddress: tttTokenAddress,
      tier: "T1_block" as TierType,
      timeSources: [], // Use fallback
      protocolFeeRate: 0.1,
      protocolFeeRecipient: hookAddress,
      fallbackPriceUsd: 10000n
    });

    // Mock initialization to avoid real RPC calls
    jest.spyOn(autoMintEngine.getEvmConnector(), "connect").mockResolvedValue(undefined);
    jest.spyOn(autoMintEngine.getEvmConnector(), "attachContract").mockImplementation(() => {});
    jest.spyOn(autoMintEngine.getEvmConnector(), "mintTTT").mockResolvedValue({ hash: "0xmint-tx" } as any);
    jest.spyOn(autoMintEngine.getEvmConnector(), "burnTTT").mockResolvedValue({ hash: "0xburn-tx" });
    jest.spyOn(autoMintEngine.getEvmConnector(), "swap").mockResolvedValue({ hash: "0xswap-tx" } as any);

    // Mock provider and signer calls
    const mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(chainId) }),
      getBlockNumber: jest.fn().mockResolvedValue(100),
      call: jest.fn().mockResolvedValue(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [ethers.parseEther("100")])
      ),
    };
    jest.spyOn(autoMintEngine.getEvmConnector(), "getProvider").mockReturnValue(mockProvider as any);
    jest.spyOn(autoMintEngine.getEvmConnector(), "getSigner").mockReturnValue(new ethers.Wallet(privateKey, mockProvider as any) as any);

    feeCollector = new ProtocolFeeCollector(
      chainId, 
      hookAddress, 
      autoMintEngine.getEvmConnector(), 
      hookAddress
    );

    // Mock ethers.Contract for ProtocolFeeCollector and UniswapV4Hook
    jest.spyOn(ethers, "Contract").mockImplementation(() => ({
      collectFee: jest.fn().mockResolvedValue({
        hash: "0xfee-tx",
        wait: jest.fn().mockResolvedValue({ status: 1 })
      }),
      balanceOf: jest.fn().mockResolvedValue(ethers.parseEther("100"))
    } as any));

    // Mock TimeSynthesis to avoid network requests in E2E test
    jest.spyOn(TimeSynthesis.prototype, "synthesize").mockResolvedValue({
      timestamp: BigInt(Date.now()) * 1000000n,
      confidence: 1,
      uncertainty: 10,
      sources: 3,
      stratum: 1
    });

    jest.spyOn(TimeSynthesis.prototype, "generateProofOfTime").mockResolvedValue({
      timestamp: BigInt(Date.now()) * 1000000n,
      uncertainty: 10,
      sources: 3,
      stratum: 1,
      confidence: 1,
      sourceReadings: [
        { source: "nist", timestamp: BigInt(Date.now()) * 1000000n, uncertainty: 10 },
        { source: "google", timestamp: BigInt(Date.now()) * 1000000n, uncertainty: 10 }
      ],
      nonce: "integration-test-nonce-0001",
      expiresAt: BigInt(Date.now()) + 60_000n
    });
    
    await autoMintEngine.initialize();

    tttBuilder = new TTTBuilder(autoMintEngine.getEvmConnector());
    
    v4Hook = new UniswapV4Hook(
      autoMintEngine.getEvmConnector(),
      hookAddress,
      tttTokenAddress
    );
  });

  test("Should execute full E2E flow: Time -> Mint -> Build -> Pool -> Hook -> Fee", async () => {
    // 1. TimeSynthesis -> AutoMintEngine
    const mintResultPromise = new Promise<any>((resolve) => {
      autoMintEngine.setOnMint((result) => resolve(result));
    });

    await autoMintEngine.mintTick();
    const mintResult = await mintResultPromise;
    expect(mintResult.txHash).toBe("0xmint-tx");
    expect(mintResult.tokenId).toBeDefined();

    // 2. ProtocolFeeCollector collects fee from AutoMint
    const feeCalc = {
      protocolFeeUsd: mintResult.protocolFeePaid,
      feeToken: "USDC",
      feeTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tier: "T1_block"
    };

    const wallet = new ethers.Wallet(privateKey);
    const nonce = 1n;
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const domain = {
      name: "Helm Protocol",
      version: "1",
      chainId: chainId,
      verifyingContract: hookAddress
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

    const signature = await wallet.signTypedData(domain, types, value);

    await feeCollector.collectMintFee(feeCalc as any, signature, wallet.address, nonce, deadline);
    expect(await feeCollector.getCollectedFees()).toBe(mintResult.protocolFeePaid);

    // 3. TTTBuilder consumes tick (Connects AutoMint-produced tokenId)
    await tttBuilder.purchaseTTT(poolAddress, ethers.parseEther("10"));
    await tttBuilder.consumeTick(mintResult.tokenId, "T1_block");
    expect(tttBuilder.getBalance()).toBeLessThan(ethers.parseEther("10"));

    // 4. PoolRegistry tracks
    poolRegistry.recordMint(poolAddress, ethers.parseEther("1"));
    poolRegistry.recordBurn(poolAddress, ethers.parseEther("0.1"));
    const stats = poolRegistry.getPoolStats(poolAddress);
    expect(stats?.minted).toBe(ethers.parseEther("1"));
    expect(stats?.burned).toBe(ethers.parseEther("0.1"));

    // 5. UniswapV4Hook swap lifecycle
    const swapParams: BeforeSwapParams = {
      sender: userAddress,
      key: { currency0: "0x0", currency1: "0x1", fee: 3000, tickSpacing: 60, hooks: hookAddress },
      params: { zeroForOne: true, amountSpecified: 1000n, sqrtPriceLimitX96: 0n },
      hookData: "0x"
    };

    await v4Hook.beforeSwap(swapParams);
    
    const afterParams: AfterSwapParams = {
      ...swapParams,
      delta: { amount0: -100n, amount1: 95n }
    };
    await v4Hook.afterSwap(afterParams);
    
    expect(v4Hook.getStats().totalSwaps).toBe(1);
    expect(BigInt(Math.floor(parseFloat(v4Hook.getStats().totalFeesCollected) * 1e18))).toBeGreaterThan(0n);
  });
});

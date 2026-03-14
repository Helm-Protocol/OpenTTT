import { ethers } from "ethers";
import { EVMConnector } from "./evm_connector";
import { ProtocolFeeCollector } from "./protocol_fee";
import { FeeCalculation } from "./dynamic_fee";
import { BeforeSwapParams, AfterSwapParams } from "./types";
import { logger } from "./logger";

/**
 * UniswapV4Hook - TTT-based Uniswap V4 Hook Simulation (SDK-side)
 *
 * This is a simulation/SDK-side hook that mirrors the logic of a Uniswap V4 hook
 * for off-chain validation and testing. It is NOT the actual Solidity on-chain hook.
 *
 * The actual V4 hook contract should implement IHooks from @uniswap/v4-core
 * (see: https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IHooks.sol).
 *
 * Provides TTT balance verification and fee management logic that can be used
 * to validate swap eligibility before submitting on-chain transactions.
 */
export class UniswapV4Hook {
  private evmConnector: EVMConnector;
  private hookAddress: string;
  private tttTokenAddress: string;
  private minTTTBalance: bigint;
  private swapFeeTTT: bigint;
  private tttContract: ethers.Contract | null = null;

  private feeCollector?: ProtocolFeeCollector;

  private stats = {
    totalSwaps: 0,
    totalFeesCollected: 0n,
    lastSwapTimestamp: 0,
    failedBurns: 0
  };

  constructor(
    evmConnector: EVMConnector,
    hookAddress: string,
    tttTokenAddress: string,
    minTTTBalance: bigint = ethers.parseEther("1.0"),
    swapFeeTTT: bigint = ethers.parseEther("0.1"),
    feeCollector?: ProtocolFeeCollector
  ) {
    this.evmConnector = evmConnector;
    this.hookAddress = hookAddress;
    this.tttTokenAddress = tttTokenAddress;
    this.minTTTBalance = minTTTBalance;
    this.swapFeeTTT = swapFeeTTT;
    this.feeCollector = feeCollector;
  }

  /**
   * beforeSwap(params: BeforeSwapParams): Promise<void>
   * Check TTT balance and deduct fees before a swap.
   */
  async beforeSwap(params: BeforeSwapParams): Promise<void> {
    logger.info(`[UniswapV4Hook] beforeSwap called for sender: ${params.sender}`);

    const provider = this.evmConnector.getProvider();
    
    // ABI for TTT balance check
    if (!this.tttContract) {
      const tttAbi = ["function balanceOf(address, uint256) view returns (uint256)"];
      this.tttContract = new ethers.Contract(this.tttTokenAddress, tttAbi, provider);
    }

    // 1. Check TTT balance of the sender
    try {
      // ERC-1155: balanceOf(address, uint256) — tokenId 0 = default TTT token
      const balance: bigint = await this.tttContract.balanceOf(params.sender, 0);
      
      if (balance < this.minTTTBalance) {
        throw new Error(
          `[UniswapV4Hook] Insufficient TTT balance for ${params.sender}. ` +
          `Required: ${ethers.formatEther(this.minTTTBalance)}, Actual: ${ethers.formatEther(balance)}`
        );
      }
      
      logger.info(`[UniswapV4Hook] TTT balance verified: ${ethers.formatEther(balance)} TTT`);
    } catch (error) {
      if ((error instanceof Error ? error.message : String(error)).includes("Insufficient TTT balance")) throw error;
      throw new Error(`[UniswapV4Hook] Failed to check TTT balance: ${(error instanceof Error ? error.message : String(error))}`);
    }

    // 2. Deduct fees (Simulated record-keeping)
    // In a production hook, this would be an on-chain state update or burn.
    this.stats.totalFeesCollected += this.swapFeeTTT;
    logger.info(`[UniswapV4Hook] TTT fee deducted: ${ethers.formatEther(this.swapFeeTTT)} TTT`);
  }

  /**
   * afterSwap(params: AfterSwapParams): Promise<void>
   * Record results and update statistics after a swap.
   */
  async afterSwap(
    params: AfterSwapParams,
    burnFeeCalc?: FeeCalculation,
    signature?: string,
    nonce?: bigint,
    deadline?: number
  ): Promise<void> {
    logger.info(`[UniswapV4Hook] afterSwap called for sender: ${params.sender}`);

    // Implement actual fee burn/transfer logic using EVMConnector
    try {
      const grgHash = ethers.keccak256(ethers.toUtf8Bytes(`burn-${params.sender}-${Date.now()}`));
      // Assuming tier 1 for simplicity in this hook
      await this.evmConnector.burnTTT(this.swapFeeTTT, grgHash, 1);
      logger.info(`[UniswapV4Hook] Fee burn executed on-chain for ${ethers.formatEther(this.swapFeeTTT)} TTT`);

      // Collect protocol burn fee if feeCollector and required params are provided
      if (this.feeCollector && burnFeeCalc && signature && nonce !== undefined && deadline !== undefined) {
        try {
          await this.feeCollector.collectBurnFee(burnFeeCalc, signature, params.sender, nonce, deadline);
        } catch (feeError) {
          logger.error(`[UniswapV4Hook] Burn fee collection failed but burn was successful: ${feeError instanceof Error ? feeError.message : feeError}`);
        }
      }
    } catch (error) {
      this.stats.failedBurns += 1;
      logger.error(`[UniswapV4Hook] Failed to execute fee burn: ${(error instanceof Error ? error.message : String(error))}`);
    }

    this.stats.totalSwaps += 1;
    this.stats.lastSwapTimestamp = Math.floor(Date.now() / 1000);
    
    // Log swap results
    const { amount0, amount1 } = params.delta;
    logger.info(`[UniswapV4Hook] Swap recorded: Delta0=${amount0}, Delta1=${amount1}`);
  }

  /**
   * getHookAddress(): string
   * Return the hook contract address.
   */
  getHookAddress(): string {
    return this.hookAddress;
  }

  /**
   * Return current statistics for the hook.
   */
  getStats() {
    return {
      totalSwaps: this.stats.totalSwaps,
      totalFeesCollected: ethers.formatEther(this.stats.totalFeesCollected),
      lastSwapTimestamp: this.stats.lastSwapTimestamp,
      failedBurns: this.stats.failedBurns
    };
  }
}

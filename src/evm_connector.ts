// sdk/src/evm_connector.ts — Production EVM Chain Connector
// Supports EIP-1559, Gas Estimation, and TTT Operations.

import { ethers, Contract, JsonRpcProvider, Signer, TransactionReceipt } from "ethers";
import { TTTRecord } from "./adaptive_switch";
import { logger } from "./logger";
import { TTTNetworkError, TTTContractError } from "./errors";

export interface VerificationResult {
  valid: boolean;
  blockNumber: number;
  timestamp: number;
  txCount: number;
  latency: number;
}

export class EVMConnector {
  private provider: JsonRpcProvider | null = null;
  private signer: Signer | null = null;
  private tttContract: Contract | null = null;
  private protocolFeeContract: Contract | null = null;
  private eventListeners: (() => void)[] = []; // P2-6: Track listeners for cleanup

  // P1-7: Timeout wrapper for gas estimation
  private static readonly GAS_TIMEOUT_MS = 5000;

  constructor() {}

  /**
   * P1-7: Race estimateGas against timeout to prevent DoS
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number = EVMConnector.GAS_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new TTTNetworkError(`[EVM] Operation timed out`, `RPC did not respond within ${ms}ms`, `Check your RPC provider status or increase timeout.`)), ms))
    ]);
  }

  /**
   * Connect to an EVM chain using either a private key or a pre-configured signer.
   */
  async connect(rpcUrl: string, signerOrKey: string | Signer): Promise<void> {
    if (!rpcUrl || typeof rpcUrl !== "string") throw new TTTNetworkError("[EVM] Invalid RPC URL", "The provided RPC URL is empty or not a string", "Pass a valid RPC URL (e.g., https://mainnet.base.org)");
    
    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      if (typeof signerOrKey === "string") {
        if (!signerOrKey.startsWith("0x") || signerOrKey.length !== 66) {
          throw new TTTContractError("[EVM] Invalid Private Key format", "Private key must be 0x + 64 hex characters", "Provide a valid 32-byte hex private key.");
        }
        this.signer = new ethers.Wallet(signerOrKey, this.provider);
      } else {
        // Signer might already be connected to a provider, but we ensure it's linked to ours
        this.signer = signerOrKey.connect ? signerOrKey.connect(this.provider) : signerOrKey;
      }
      
      const network = await this.provider.getNetwork();
      logger.info(`[EVM] Connected to Chain ID: ${network.chainId}`);
    } catch (error) {
      if (error instanceof TTTContractError || error instanceof TTTNetworkError) throw error;
      throw new TTTNetworkError(`[EVM] Connection failed`, error instanceof Error ? error.message : String(error), `Verify your RPC URL and network connectivity.`);
    }
  }

  /**
   * Attach the TTT Token contract.
   */
  attachContract(address: string, abi: any[]): void {
    if (!this.signer) throw new TTTContractError("Not connected to signer", "EVMConnector.connect() must be called first", "Initialize connection before attaching contracts.");
    if (!address || !ethers.isAddress(address)) throw new TTTContractError(`[EVM] Invalid contract address`, `Address '${address}' is not a valid EVM address`, `Check your config and provide a valid checksummed address.`);
    this.tttContract = new Contract(address, abi, this.signer);
  }

  /**
   * Attach the ProtocolFee contract.
   */
  attachProtocolFeeContract(address: string, abi: any[]): void {
    if (!this.signer) throw new TTTContractError("Not connected to signer", "EVMConnector.connect() must be called first", "Initialize connection before attaching contracts.");
    if (!address || !ethers.isAddress(address)) throw new TTTContractError(`[EVM] Invalid contract address`, `Address '${address}' is not a valid EVM address`, `Check your config and provide a valid checksummed address.`);
    this.protocolFeeContract = new Contract(address, abi, this.signer);
  }

  /**
   * Generic TTT Record Submission (Burn)
   */
  async submitTTTRecord(record: TTTRecord, amount: bigint, tier: number): Promise<TransactionReceipt> {
    if (!this.tttContract) throw new TTTContractError("Contract not attached", "TTT contract instance is null", "Call attachContract() with valid TTT address before burning.");

    const grgHash = ethers.keccak256(ethers.concat(record.grgPayload));
    
    try {
      // P1-7: Gas estimation with timeout
      const gasLimit = await this.withTimeout(this.tttContract.burn.estimateGas(amount, grgHash, tier));

      const tx = await this.tttContract.burn(amount, grgHash, tier, {
        gasLimit: (gasLimit * 120n) / 100n
      });

      logger.info(`[EVM] TTT Record TX Sent: ${tx.hash}`);
      const receipt = await tx.wait();
      // P2-5: Null check for dropped transactions
      if (!receipt) throw new TTTNetworkError(`[EVM] Transaction failed`, `Transaction was dropped from mempool or null receipt`, `Check block explorer for tx status.`);
      return receipt;
    } catch (error) {
      if (error instanceof TTTNetworkError || error instanceof TTTContractError) throw error;
      const reason = this.extractRevertReason(error);
      throw new TTTContractError(`[EVM] Burn failed`, reason, `Verify your TTT balance and tier parameters.`);
    }
  }

  /**
   * Mint TTT (Owner only)
   */
  async mintTTT(to: string, amount: bigint, grgHash: string, potHash?: string): Promise<TransactionReceipt> {
    if (!this.tttContract) throw new TTTContractError("Contract not attached", "TTT contract instance is null", "Call attachContract() before minting.");
    if (!to || !ethers.isAddress(to)) throw new TTTContractError(`[EVM] Invalid recipient address`, `Address '${to}' is not a valid EVM address`, `Provide a valid destination address.`);

    try {
      if (potHash) {
        logger.info(`[EVM] Recording PoT fingerprint: ${potHash}`);
      }
      const tx = await this.tttContract.mint(to, amount, grgHash);
      const receipt = await tx.wait();
      if (!receipt) throw new TTTNetworkError(`[EVM] Mint TX dropped`, `Transaction was dropped from mempool`, `Check operator account for nonce collisions.`);
      return receipt;
    } catch (error) {
      const reason = this.extractRevertReason(error);
      throw new TTTContractError(`[EVM] Mint failed`, reason, `Ensure operator has minter role and sufficient gas.`);
    }
  }

  /**
   * Burn TTT (Simple wrapper)
   */
  async burnTTT(amount: bigint, grgHash: string, tierLevel: number): Promise<{hash: string}> {
    if (!this.tttContract) throw new TTTContractError("Contract not attached", "TTT contract instance is null", "Call attachContract() before burning.");

    try {
      const tx = await this.tttContract.burn(amount, grgHash, tierLevel);
      const receipt = await tx.wait();
      if (!receipt) throw new TTTNetworkError(`[EVM] Burn TX dropped`, `Transaction was dropped from mempool`, `Verify account balance.`);
      return { hash: receipt.hash };
    } catch (error) {
      const reason = this.extractRevertReason(error);
      throw new TTTContractError(`[EVM] Burn failed`, reason, `Check TTT balance.`);
    }
  }

  /**
   * Get TTT Balance (ERC-1155)
   */
  async getTTTBalance(user: string, tokenId: bigint): Promise<bigint> {
    if (!this.tttContract) throw new TTTContractError("Contract not attached", "TTT contract instance is null", "Call attachContract() before querying balance.");
    try {
      return await this.tttContract.balanceOf(user, tokenId);
    } catch (error) {
      const reason = this.extractRevertReason(error);
      throw new TTTContractError(`[EVM] Balance query failed`, reason, `Check RPC connection and contract address.`);
    }
  }

  /**
   * Swap tokens on a DEX (Uniswap V4 Simulation)
   */
  async swap(
    routerAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint
  ): Promise<TransactionReceipt> {
    if (!this.signer) throw new TTTContractError("Not connected to signer", "Signer is null", "Initialize connection.");
    if (!routerAddress || !ethers.isAddress(routerAddress)) throw new TTTContractError(`[EVM] Invalid router address`, `Address '${routerAddress}' is invalid`, `Provide valid V4 SwapRouter address.`);

    logger.info(`[EVM] Swapping ${amountIn} of ${tokenIn} for ${tokenOut} via ${routerAddress}`);

    // Realistic Uniswap V4-like SwapRouter ABI for simulation/integration
    const swapRouterAbi = [
      "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256)"
    ];
    
    const routerContract = new ethers.Contract(routerAddress, swapRouterAbi, this.signer);

    try {
      // P1-7: Gas estimation with timeout
      const gasLimit = await this.withTimeout(routerContract.swap.estimateGas(tokenIn, tokenOut, amountIn, minAmountOut));

      const tx = await routerContract.swap(tokenIn, tokenOut, amountIn, minAmountOut, {
        gasLimit: (gasLimit * 120n) / 100n
      });

      logger.info(`[EVM] Swap TX Sent: ${tx.hash}`);
      const receipt = await tx.wait();
      if (!receipt) throw new TTTNetworkError(`[EVM] Swap TX dropped`, `Transaction dropped`, `Check gas price.`);
      return receipt;
    } catch (error) {
      if (error instanceof TTTNetworkError || error instanceof TTTContractError) throw error;
      const reason = this.extractRevertReason(error);
      throw new TTTContractError(`[EVM] Swap failed`, reason, `Verify slippage and token balances.`);
    }
  }

  /**
   * Subscribe to TTT and Fee events.
   */
  async subscribeToEvents(callbacks: {
    onMinted?: (to: string, tokenId: bigint, amount: bigint) => void,
    onBurned?: (from: string, tokenId: bigint, amount: bigint, tier: bigint) => void,
    onFeeCollected?: (payer: string, amount: bigint, nonce: bigint) => void
  }): Promise<void> {
    // R2-P1-1: Auto-cleanup previous listeners before re-subscribing (idempotency)
    if (this.eventListeners.length > 0) {
      this.unsubscribeAll();
    }

    if (this.tttContract) {
      if (callbacks.onMinted) {
        const handler = (to: string, tokenId: bigint, amount: bigint) => {
          callbacks.onMinted!(to, tokenId, amount);
        };
        this.tttContract.on("TTTMinted", handler);
        // R6-P1-2: Store direct handler reference for reliable .off() cleanup
        const contract = this.tttContract;
        this.eventListeners.push(() => contract.off("TTTMinted", handler));
      }
      if (callbacks.onBurned) {
        const handler = (from: string, tokenId: bigint, amount: bigint, tier: bigint) => {
          callbacks.onBurned!(from, tokenId, amount, tier);
        };
        this.tttContract.on("TTTBurned", handler);
        const contract = this.tttContract;
        this.eventListeners.push(() => contract.off("TTTBurned", handler));
      }
    }

    if (this.protocolFeeContract && callbacks.onFeeCollected) {
      const handler = (payer: string, amount: bigint, nonce: bigint) => {
        callbacks.onFeeCollected!(payer, amount, nonce);
      };
      this.protocolFeeContract.on("FeeCollected", handler);
      const contract = this.protocolFeeContract;
      this.eventListeners.push(() => contract.off("FeeCollected", handler));
    }

    logger.info("[EVM] Subscribed to TTT and Fee events");
  }

  /**
   * P2-6: Unsubscribe all event listeners to prevent memory leaks.
   */
  unsubscribeAll(): void {
    for (const unsub of this.eventListeners) {
      try { unsub(); } catch { /* already removed */ }
    }
    this.eventListeners = [];
    logger.info(`[EVM] All event listeners unsubscribed`);
  }

  /**
   * Verify Block Data
   */
  async verifyBlock(blockNum: number): Promise<VerificationResult> {
    if (!this.provider) throw new TTTNetworkError("Provider not connected", "RPC provider is null", "Call connect() first.");

    const block = await this.provider.getBlock(blockNum);
    if (!block) throw new TTTNetworkError(`Block not found`, `RPC returned null for block ${blockNum}`, `Verify if block number exists on chain.`);

    return {
      valid: true,
      blockNumber: blockNum,
      timestamp: block.timestamp,
      txCount: block.transactions.length,
      latency: Math.floor(Date.now() / 1000) - block.timestamp
    };
  }

  /**
   * Get pending transactions for the current provider.
   */
  async getPendingTransactions(): Promise<string[]> {
    if (!this.provider) throw new TTTNetworkError("Provider not connected", "RPC provider is null", "Call connect() first.");
    const block = await this.provider.send("eth_getBlockByNumber", ["pending", false]);
    return block ? block.transactions : [];
  }

  /**
   * Get the provider instance.
   */
  getProvider(): JsonRpcProvider {
    if (!this.provider) throw new TTTNetworkError("Provider not connected", "RPC provider is null", "Call connect() first.");
    return this.provider;
  }

  /**
   * Get the signer instance.
   */
  getSigner(): Signer {
    if (!this.signer) throw new TTTContractError("Signer not connected", "Signer is null", "Call connect() first.");
    return this.signer;
  }

  /**
   * Extract human-readable revert reason from ethers error.
   */
  private extractRevertReason(error: unknown): string {
    if (error && typeof error === "object") {
      const e = error as Record<string, unknown>;
      if (typeof e.reason === "string") return e.reason;
      if (e.data && typeof e.data === "object" && typeof (e.data as Record<string, unknown>).message === "string") return (e.data as Record<string, unknown>).message as string;
      if (typeof e.message === "string") return e.message;
    }
    return String(error ?? "Unknown EVM error");
  }
}

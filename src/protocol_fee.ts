import { ethers } from "ethers";
import { FeeCalculation } from "./dynamic_fee";
import { logger } from "./logger";
import { EVMConnector } from "./evm_connector";

/**
 * Pluggable replay cache interface for signature deduplication.
 * Implement this to use Redis, database, or other external stores.
 */
export interface ReplayCache {
  has(key: string): Promise<boolean>;
  set(key: string, ttlMs: number): Promise<void>;
}

/**
 * Default in-memory replay cache with bounded size and TTL eviction.
 * Suitable for single-process deployments; use a distributed ReplayCache
 * implementation (e.g., Redis) for multi-node setups.
 */
export class InMemoryReplayCache implements ReplayCache {
  private entries: Map<string, number> = new Map();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private lastPruneTime = 0;
  private static readonly PRUNE_INTERVAL_MS = 60000;

  constructor(maxEntries: number = 10000, defaultTtlMs: number = 3600000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  async has(key: string): Promise<boolean> {
    this.pruneIfNeeded();
    const ts = this.entries.get(key);
    if (ts === undefined) return false;
    if (Date.now() - ts > this.defaultTtlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  async set(key: string, ttlMs: number): Promise<void> {
    this.pruneIfNeeded();
    this.entries.set(key, Date.now());
  }

  private pruneIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastPruneTime < InMemoryReplayCache.PRUNE_INTERVAL_MS &&
        this.entries.size <= this.maxEntries) {
      return;
    }
    this.lastPruneTime = now;

    for (const [sig, ts] of this.entries) {
      if (now - ts > this.defaultTtlMs) {
        this.entries.delete(sig);
      }
    }
    // If still over limit, remove oldest entries
    if (this.entries.size > this.maxEntries) {
      const sorted = [...this.entries.entries()].sort((a, b) => a[1] - b[1]);
      const toRemove = sorted.slice(0, sorted.length - this.maxEntries);
      for (const [sig] of toRemove) {
        this.entries.delete(sig);
      }
    }
  }
}

/**
 * ProtocolFeeCollector - Handles Helm protocol fee collection and verification.
 * Includes EIP-712 signature verification for x402 compliance.
 */
export class ProtocolFeeCollector {
  private totalCollected: bigint = 0n;
  private chainId: number;
  private verifyingContract: string;
  private replayCache: ReplayCache;
  private evmConnector: EVMConnector;
  private protocolFeeRecipient: string;
  private feeContract: ethers.Contract | null = null;

  constructor(chainId: number, verifyingContract: string, evmConnector: EVMConnector, protocolFeeRecipient: string, replayCache?: ReplayCache) {
    // R3-P0-2: Validate chainId is a positive integer to prevent cross-chain replay
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error(`[ProtocolFee] Invalid chainId: ${chainId}. Must be a positive integer.`);
    }
    this.chainId = chainId;
    this.verifyingContract = ethers.getAddress(verifyingContract);
    this.evmConnector = evmConnector;
    this.protocolFeeRecipient = ethers.getAddress(protocolFeeRecipient);
    this.replayCache = replayCache ?? new InMemoryReplayCache();
  }

  /**
   * R3-P0-2: Verify chainId matches the actual connected network.
   * Must be called after EVMConnector.connect() to prevent cross-chain signature replay.
   */
  async validateChainId(): Promise<void> {
    const provider = this.evmConnector.getProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== this.chainId) {
      throw new Error(`[ProtocolFee] Chain ID mismatch: configured ${this.chainId}, network reports ${network.chainId}. Cross-chain replay risk!`);
    }
  }

  private getFeeContract(): ethers.Contract {
    if (this.feeContract) return this.feeContract;
    
    const abi = [
      "function collectFee(address token, uint256 amount, bytes calldata signature, uint256 nonce, uint256 deadline) external"
    ];
    // ProtocolFeeCollector uses verifyingContract as the ProtocolFee.sol address
    this.feeContract = new ethers.Contract(this.verifyingContract, abi, this.evmConnector.getSigner());
    return this.feeContract;
  }

  /**
   * Collect minting fee (Stablecoin).
   * @param feeCalc - Fee calculation result from DynamicFeeEngine.
   * @param signature - EIP-712 signature (required, for x402 verification).
   * @param user - Signer address.
   * @param nonce - Anti-replay nonce.
   * @param deadline - Signature expiration timestamp.
   */
  async collectMintFee(
    feeCalc: FeeCalculation, 
    signature: string, 
    user: string, 
    nonce: bigint, 
    deadline: number
  ): Promise<void> {
    try {
      await this.verifySignature(feeCalc, signature, user, nonce, deadline);
      
      // Actual on-chain collection
      const contract = this.getFeeContract();
      const tx = await contract.collectFee(
        ethers.getAddress(feeCalc.feeTokenAddress),
        feeCalc.protocolFeeUsd,
        signature,
        nonce,
        deadline
      );
      await tx.wait();
      
      this.totalCollected += feeCalc.protocolFeeUsd;
      logger.info(`[ProtocolFee] Mint fee collected on-chain: ${feeCalc.protocolFeeUsd} ${feeCalc.feeToken}. TX: ${tx.hash}`);
    } catch (error) {
      throw new Error(`[ProtocolFee] Mint fee collection failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Collect burn fee.
   * @param feeCalc - Fee calculation result from DynamicFeeEngine.
   * @param signature - EIP-712 signature (required).
   * @param user - Signer address.
   * @param nonce - Anti-replay nonce.
   * @param deadline - Signature expiration timestamp.
   */
  async collectBurnFee(
    feeCalc: FeeCalculation, 
    signature: string, 
    user: string,
    nonce: bigint,
    deadline: number
  ): Promise<void> {
    try {
      await this.verifySignature(feeCalc, signature, user, nonce, deadline);

      // Actual on-chain collection
      const contract = this.getFeeContract();
      const tx = await contract.collectFee(
        ethers.getAddress(feeCalc.feeTokenAddress),
        feeCalc.protocolFeeUsd,
        signature,
        nonce,
        deadline
      );
      await tx.wait();
      
      this.totalCollected += feeCalc.protocolFeeUsd;
      logger.info(`[ProtocolFee] Burn fee collected on-chain: ${feeCalc.protocolFeeUsd} ${feeCalc.feeToken}. TX: ${tx.hash}`);
    } catch (error) {
      throw new Error(`[ProtocolFee] Burn fee collection failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Return total fees collected so far.
   */
  async getCollectedFees(): Promise<bigint> {
    return this.totalCollected;
  }

  /**
   * EIP-712 signature verification (x402 compliance).
   */
  private async verifySignature(
    feeCalc: FeeCalculation, 
    signature: string, 
    user: string,
    nonce: bigint,
    deadline: number
  ): Promise<void> {
    // B1-2 + P1-2: Replay protection via pluggable cache
    if (await this.replayCache.has(signature)) {
      throw new Error("Signature already used (replay protection)");
    }

    // B1-2: Deadline check
    const now = Math.floor(Date.now() / 1000);
    if (deadline < now) {
      throw new Error("Signature deadline expired");
    }

    const normalizedUser = ethers.getAddress(user);
    const domain = {
      name: "Helm Protocol",
      version: "1",
      chainId: this.chainId,
      verifyingContract: this.verifyingContract
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

    try {
      const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
      if (ethers.getAddress(recoveredAddress) !== normalizedUser) {
        throw new Error("Invalid EIP-712 signature: signer mismatch");
      }
      await this.replayCache.set(signature, 3600000); // Mark as used with 1h TTL
    } catch (error) {
      throw new Error(`[ProtocolFee] Signature verification failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }
}

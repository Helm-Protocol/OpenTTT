import { ethers, Signer } from "ethers";
import { TimeSynthesis } from "./time_synthesis";
import { DynamicFeeEngine, FeeCalculation } from "./dynamic_fee";
import { EVMConnector } from "./evm_connector";
import { ProtocolFeeCollector } from "./protocol_fee";
import { PotSigner } from "./pot_signer";
import { GrgForward } from "./grg_forward";
import { TierIntervals, AutoMintConfig, MintResult } from "./types";
import { logger } from "./logger";
import { TTTConfigError, TTTSignerError, TTTTimeSynthesisError, TTTFeeError } from "./errors";

/** Maximum retry attempts for RPC-dependent operations within a single tick */
const MINT_TICK_MAX_RETRIES = 3;

/** Backoff durations in ms for each retry attempt (1s, 2s, 4s) */
const MINT_TICK_BACKOFF_MS = [1000, 2000, 4000];

/**
 * AutoMintEngine - Automatic TTT minting engine.
 * Combines time synthesis, dynamic fee calculation, and EVM minting into a single loop.
 */
export class AutoMintEngine {
  private config: AutoMintConfig;
  private timeSynthesis: TimeSynthesis;
  private feeEngine: DynamicFeeEngine;
  private evmConnector: EVMConnector;
  private feeCollector: ProtocolFeeCollector | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private onMintCallback?: (result: MintResult) => void;
  private onFailureCallback?: (error: Error) => void;
  private onLatencyCallback?: (ms: number) => void;
  private cachedSigner: Signer | null = null;
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 5;
  private potSigner: PotSigner | null = null;
  /** Monotonic counter appended to tokenId hash to prevent collision when two mints share the same nanosecond timestamp. */
  private mintNonce: number = 0;

  constructor(config: AutoMintConfig) {
    this.config = config;
    this.timeSynthesis = new TimeSynthesis({ sources: config.timeSources });
    this.feeEngine = new DynamicFeeEngine({
      cacheDurationMs: 5000,
      fallbackPriceUsd: config.fallbackPriceUsd || 10000n,
    });
    this.evmConnector = new EVMConnector();
    if (config.signer) {
      this.cachedSigner = config.signer;
    }
    // Initialize Ed25519 PoT signer for non-repudiation
    this.potSigner = new PotSigner();
  }

  public getEvmConnector(): EVMConnector {
    return this.evmConnector;
  }

  public getTimeSynthesis(): TimeSynthesis {
    return this.timeSynthesis;
  }

  public setOnMint(callback: (result: MintResult) => void): void {
    this.onMintCallback = callback;
  }

  public setOnFailure(callback: (error: Error) => void): void {
    this.onFailureCallback = callback;
  }

  public setOnLatency(callback: (ms: number) => void): void {
    this.onLatencyCallback = callback;
  }

  /**
   * Initialize the engine (RPC connection and contract setup).
   */
  async initialize(): Promise<void> {
    try {
      const signerOrKey = this.config.signer || this.config.privateKey;
      if (!signerOrKey) throw new TTTConfigError("[AutoMint] Signer or Private Key is required", "Missing both 'signer' and 'privateKey' in config", "Provide a valid ethers.Signer or a private key string in your configuration.");

      await this.evmConnector.connect(this.config.rpcUrl, signerOrKey);
      await this.feeEngine.connect(this.config.rpcUrl);
      
      this.cachedSigner = this.evmConnector.getSigner();
      
      const tttAbi = [
        "function mint(address to, uint256 amount, bytes32 grgHash) external returns (bool)",
        "function burn(uint256 amount, bytes32 grgHash, uint256 tier) external",
        "function balanceOf(address account, uint256 id) external view returns (uint256)",
        "event TTTMinted(address indexed to, uint256 indexed tokenId, uint256 amount)",
        "event TTTBurned(address indexed from, uint256 indexed tokenId, uint256 amount, uint256 tier)",
        // CT Log equivalent: every PoT is publicly auditable on-chain
        EVMConnector.POT_ANCHORED_EVENT_ABI
      ];
      this.evmConnector.attachContract(this.config.contractAddress, tttAbi);

      if (this.config.feeCollectorAddress) {
        this.feeCollector = new ProtocolFeeCollector(
          this.config.chainId,
          this.config.feeCollectorAddress,
          this.evmConnector,
          this.config.protocolFeeRecipient
        );
        await this.feeCollector.validateChainId();
      }
    } catch (error) {
      // State rollback: Ensure connections are closed or reset
      this.evmConnector = new EVMConnector();
      this.cachedSigner = null;
      this.feeCollector = null;
      logger.error(`[AutoMint] Initialization failed, state rolled back: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Start the automatic minting loop.
   */
  start(): void {
    if (this.isRunning) return;
    
    // Clear existing timer if any
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const interval = TierIntervals[this.config.tier];
    this.isRunning = true;
    
    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      const tickStart = Date.now();
      try {
        await this.mintTick();
        this.consecutiveFailures = 0;
        // H2: Report latency to TTTClient
        if (this.onLatencyCallback) {
          this.onLatencyCallback(Date.now() - tickStart);
        }
      } catch (error) {
        this.consecutiveFailures++;
        // H2: Report failure to TTTClient
        if (this.onFailureCallback) {
          this.onFailureCallback(error instanceof Error ? error : new Error(String(error)));
        }
        logger.error(`[AutoMint] Tick execution failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error instanceof Error ? error.message : error}`);
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          logger.error(`[AutoMint] Circuit breaker triggered: ${this.consecutiveFailures} consecutive failures. Stopping engine to prevent DoS.`);
          this.stop();
        }
      } finally {
        this.isProcessing = false;
      }
    }, interval);
    
    logger.info(`[AutoMint] Loop started for tier ${this.config.tier} (${interval}ms)`);
  }

  /**
   * Stop the automatic minting loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info(`[AutoMint] Loop stopped`);
  }

  /**
   * Resume the minting loop after a circuit breaker trip.
   * Resets the consecutive failure counter and restarts the loop.
   */
  resume(): void {
    this.consecutiveFailures = 0;
    logger.info(`[AutoMint] Consecutive failures reset, resuming...`);
    this.start();
  }

  /**
   * Sleep helper for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute a single mint tick.
   * Time synthesis -> tokenId generation -> EVM mint call -> fee calculation/deduction.
   */
  async mintTick(): Promise<void> {
    // 1. Time Synthesis
    const synthesized = await this.timeSynthesis.synthesize();
    if (!synthesized) {
      logger.warn(`[AutoMint] Time synthesis returned null/undefined, skipping tick`);
      return;
    }

    // Fix-12: Integrity check
    if (synthesized.confidence === 0 || synthesized.stratum >= 16) {
      throw new TTTTimeSynthesisError(`[AutoMint] Synthesis integrity check failed`, `confidence=${synthesized.confidence}, stratum=${synthesized.stratum}`, `Check NTP sources or network connectivity.`);
    }

    // 1-1. PoT Generation & Validation (W1-1)
    const pot = await this.timeSynthesis.generateProofOfTime();
    if (pot.confidence < 0.5) {
      throw new TTTTimeSynthesisError(`[PoT] Insufficient confidence`, `Calculated confidence ${pot.confidence} is below required 0.5`, `Ensure more NTP sources are reachable or decrease uncertainty.`);
    }
    // Deterministic potHash via ABI.encode — field order is fixed,
    // independent of JS engine key ordering. External verifiers can
    // reproduce this hash from the same PoT fields.
    const nonceHash = ethers.keccak256(ethers.toUtf8Bytes(pot.nonce));
    const potHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint64", "uint64", "uint8", "uint8", "uint32", "bytes32"],
        [
          pot.timestamp,
          pot.expiresAt,
          pot.sources,
          pot.stratum,
          Math.round(pot.confidence * 1_000_000),
          nonceHash
        ]
      )
    );

    // 1-2. Ed25519 issuer signature for non-repudiation
    if (this.potSigner) {
      pot.issuerSignature = this.potSigner.signPot(potHash);
      logger.info(`[AutoMint] PoT signed by issuer ${this.potSigner.getPubKeyHex().substring(0, 16)}...`);
    }

    // 2. Generate tokenId (keccak256)
    // Unique ID based on chainId, poolAddress, timestamp, and a monotonic nonce
    // to prevent collision if two mints occur at the same nanosecond timestamp.
    const nonceSuffix = this.mintNonce++;
    const tokenId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint64", "uint256"],
        [BigInt(this.config.chainId), this.config.poolAddress, synthesized.timestamp, BigInt(nonceSuffix)]
      )
    );

    // 3. Fee calculation
    const feeCalculation = await this.feeEngine.calculateMintFee(this.config.tier);
    
    // 4. EVM mint call — run full GRG pipeline (Golomb → Reed-Solomon → Golay+HMAC)
    const grgPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint64", "uint8"],
      [tokenId, potHash, synthesized.timestamp, pot.sources]
    );
    const grgStart = Date.now();
    const grgShards = GrgForward.encode(
      ethers.getBytes(grgPayload),
      this.config.chainId,
      this.config.poolAddress
    );
    const grgElapsed = Date.now() - grgStart;
    logger.info(`[AutoMint] GRG pipeline completed in ${grgElapsed}ms`);
    if (grgElapsed > 50) {
      logger.warn(`[AutoMint] GRG pipeline took ${grgElapsed}ms (>50ms threshold). Consider offloading to a Worker Thread for T3_micro tiers.`);
    }
    // On-chain hash = keccak256 of concatenated GRG-encoded shards
    const grgHash = ethers.keccak256(ethers.concat(grgShards));

    // Recipient address (defaults to signer address)
    if (!this.cachedSigner) {
      throw new TTTSignerError("[AutoMint] Signer not initialized", "cachedSigner is null", "Initialize the engine before calling mintTick().");
    }
    const recipient = await this.cachedSigner.getAddress();

    logger.info(`[AutoMint] Executing mint: tokenId=${tokenId.substring(0, 10)}... amount=${feeCalculation.tttAmount}`);

    // Retry loop for RPC-dependent mint operation (max 3 attempts, backoff 1s/2s/4s)
    let receipt: any;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MINT_TICK_MAX_RETRIES; attempt++) {
      try {
        receipt = await this.evmConnector.mintTTT(
          recipient,
          feeCalculation.tttAmount,
          grgHash,
          potHash
        );
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MINT_TICK_MAX_RETRIES - 1) {
          const backoff = MINT_TICK_BACKOFF_MS[attempt];
          logger.warn(`[AutoMint] Mint attempt ${attempt + 1}/${MINT_TICK_MAX_RETRIES} failed, retrying in ${backoff}ms: ${lastError.message}`);
          await this.sleep(backoff);
        }
      }
    }
    if (lastError || !receipt) {
      throw lastError || new Error("[AutoMint] Mint failed after all retries");
    }

    // 5. Fee deduction/recording (handled by contract or tracked at SDK level)
    // W2-3: Actual ProtocolFeeCollector call
    let actualFeePaid = feeCalculation.protocolFeeUsd;
    if (this.feeCollector && this.config.feeCollectorAddress) {
      try {
        // NOTE: Single-threaded JS guarantees atomicity between nonce generation,
        // signing, and collection below. If running multiple AutoMintEngine instances
        // (e.g., worker_threads or cluster), a separate nonce manager with locking is required.
        // Sequential nonce: query contract for current nonce, matching ProtocolFee.sol's require(nonces[msg.sender] == nonce)
        const feeContract = new ethers.Contract(
          this.config.feeCollectorAddress!,
          ["function getNonce(address) external view returns (uint256)"],
          this.evmConnector.getProvider()
        );
        const nonce = BigInt(await feeContract.getNonce(recipient));
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity

        const signature = await this.signFeeMessage(feeCalculation, nonce, deadline);
        const user = recipient;

        await this.feeCollector.collectMintFee(
          feeCalculation,
          signature,
          user,
          nonce,
          deadline
        );
      } catch (feeError) {
        logger.error(`[AutoMint] Fee collection failed but mint was successful: ${feeError instanceof Error ? feeError.message : feeError}`);
        // Reset to 0 so downstream (onMint callback, ledger) does not record a fee that was never collected
        actualFeePaid = 0n;
      }
    }

    // CT Log equivalent: log PoT anchor info for subgraph indexers
    logger.info(`[AutoMint] PoTAnchored: timestamp=${synthesized.timestamp}, grgHash=${grgHash}, stratum=${synthesized.stratum}, potHash=${potHash}`);

    logger.info(`[AutoMint] Mint success: tx=${receipt.hash}, feePaid=${actualFeePaid} (USDC eq)`);

    if (this.onMintCallback) {
      this.onMintCallback({
        tokenId: tokenId,
        grgHash: grgHash,
        timestamp: synthesized.timestamp,
        txHash: receipt.hash,
        protocolFeePaid: actualFeePaid,
        proofOfTime: pot
      });
    }
  }

  private async signFeeMessage(feeCalc: FeeCalculation, nonce: bigint, deadline: number): Promise<string> {
    if (!this.cachedSigner) {
      throw new TTTSignerError("[AutoMint] Signer not initialized", "cachedSigner is null", "Ensure initialize() was called successfully.");
    }

    // Type casting to handle signTypedData if available on the signer (Wallet supports it)
    const signer = this.cachedSigner as any;
    if (typeof signer.signTypedData !== 'function') {
      throw new TTTSignerError("[AutoMint] Provided signer does not support signTypedData (EIP-712)", `Signer type ${signer.constructor.name} missing signTypedData`, "Use a Wallet or a signer that implements EIP-712 signTypedData.");
    }
    
    const domain = {
      name: "OpenTTT_ProtocolFee",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: this.config.feeCollectorAddress!
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
}

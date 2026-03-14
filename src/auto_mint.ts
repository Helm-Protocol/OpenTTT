import { ethers, Signer } from "ethers";
import { randomBytes } from "crypto";
import { TimeSynthesis } from "./time_synthesis";
import { DynamicFeeEngine, FeeCalculation } from "./dynamic_fee";
import { EVMConnector } from "./evm_connector";
import { ProtocolFeeCollector } from "./protocol_fee";
import { PotSigner } from "./pot_signer";
import { TierIntervals, AutoMintConfig, MintResult } from "./types";
import { logger } from "./logger";
import { TTTConfigError, TTTSignerError, TTTTimeSynthesisError, TTTFeeError } from "./errors";

/**
 * AutoMintEngine - TTT 자동 민팅 엔진
 * 시간 합성, 동적 수수료 계산, EVM 민팅을 하나의 루프로 결합
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
   * 엔진 초기화 (RPC 연결 및 컨트랙트 설정)
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
        "event TTTBurned(address indexed from, uint256 indexed tokenId, uint256 amount, uint256 tier)"
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
   * 자동 민팅 루프 시작
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
   * 자동 민팅 루프 정지
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
   * 단일 민트 틱 실행
   * 시간합성 → tokenId 생성 → EVM mint 호출 → 수수료 계산/차감
   */
  async mintTick(): Promise<void> {
    // 1. 시간 합성 (Time Synthesis)
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
    const potHash = ethers.keccak256(
      ethers.toUtf8Bytes(
        JSON.stringify(pot, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      )
    );

    // 1-2. Ed25519 issuer signature for non-repudiation
    if (this.potSigner) {
      pot.issuerSignature = this.potSigner.signPot(potHash);
      logger.info(`[AutoMint] PoT signed by issuer ${this.potSigner.getPubKeyHex().substring(0, 16)}...`);
    }

    // 2. tokenId 생성 (keccak256)
    // chainId, poolAddress, timestamp 기반 유니크 ID
    const tokenId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint64"],
        [BigInt(this.config.chainId), this.config.poolAddress, synthesized.timestamp]
      )
    );

    // 3. 수수료 계산
    const feeCalculation = await this.feeEngine.calculateMintFee(this.config.tier);
    
    // 4. EVM mint 호출
    // grgHash는 현재 tokenId를 기반으로 생성 (실제 구현에선 더 복잡한 GRG 페이로드 사용 가능)
    const grgHash = tokenId; 
    
    // 수취인 주소 (기본적으로 signer 주소)
    if (!this.cachedSigner) {
      throw new TTTSignerError("[AutoMint] Signer not initialized", "cachedSigner is null", "Initialize the engine before calling mintTick().");
    }
    const recipient = await this.cachedSigner.getAddress();

    logger.info(`[AutoMint] Executing mint: tokenId=${tokenId.substring(0, 10)}... amount=${feeCalculation.tttAmount}`);

    const receipt = await this.evmConnector.mintTTT(
      recipient,
      feeCalculation.tttAmount,
      grgHash,
      potHash
    );

    // 5. 수수료 차감/기록 (실제 컨트랙트에서 처리되거나 SDK 레벨에서 추적)
    // W2-3: Actual ProtocolFeeCollector call
    let actualFeePaid = feeCalculation.protocolFeeUsd;
    if (this.feeCollector && this.config.feeCollectorAddress) {
      try {
        // NOTE: Single-threaded JS guarantees atomicity between nonce generation,
        // signing, and collection below. If running multiple AutoMintEngine instances
        // (e.g., worker_threads or cluster), a separate nonce manager with locking is required.
        const nonce = BigInt("0x" + randomBytes(8).toString("hex")); // Cryptographic nonce
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
      name: "Helm Protocol",
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

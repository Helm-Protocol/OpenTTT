"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoMintEngine = void 0;
const ethers_1 = require("ethers");
const crypto_1 = require("crypto");
const time_synthesis_1 = require("./time_synthesis");
const dynamic_fee_1 = require("./dynamic_fee");
const evm_connector_1 = require("./evm_connector");
const protocol_fee_1 = require("./protocol_fee");
const types_1 = require("./types");
const logger_1 = require("./logger");
const errors_1 = require("./errors");
/**
 * AutoMintEngine - TTT 자동 민팅 엔진
 * 시간 합성, 동적 수수료 계산, EVM 민팅을 하나의 루프로 결합
 */
class AutoMintEngine {
    config;
    timeSynthesis;
    feeEngine;
    evmConnector;
    feeCollector = null;
    timer = null;
    isRunning = false;
    isProcessing = false;
    onMintCallback;
    cachedSigner = null;
    constructor(config) {
        this.config = config;
        this.timeSynthesis = new time_synthesis_1.TimeSynthesis({ sources: config.timeSources });
        this.feeEngine = new dynamic_fee_1.DynamicFeeEngine({
            cacheDurationMs: 60000,
            fallbackPriceUsd: config.fallbackPriceUsd || 10000n,
        });
        this.evmConnector = new evm_connector_1.EVMConnector();
        if (config.signer) {
            this.cachedSigner = config.signer;
        }
    }
    getEvmConnector() {
        return this.evmConnector;
    }
    setOnMint(callback) {
        this.onMintCallback = callback;
    }
    /**
     * 엔진 초기화 (RPC 연결 및 컨트랙트 설정)
     */
    async initialize() {
        try {
            const signerOrKey = this.config.signer || this.config.privateKey;
            if (!signerOrKey)
                throw new errors_1.TTTConfigError("[AutoMint] Signer or Private Key is required", "Missing both 'signer' and 'privateKey' in config", "Provide a valid ethers.Signer or a private key string in your configuration.");
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
                this.feeCollector = new protocol_fee_1.ProtocolFeeCollector(this.config.chainId, this.config.feeCollectorAddress, this.evmConnector, this.config.protocolFeeRecipient);
            }
        }
        catch (error) {
            // State rollback: Ensure connections are closed or reset
            this.evmConnector = new evm_connector_1.EVMConnector();
            this.cachedSigner = null;
            this.feeCollector = null;
            logger_1.logger.error(`[AutoMint] Initialization failed, state rolled back: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }
    /**
     * 자동 민팅 루프 시작
     */
    start() {
        if (this.isRunning)
            return;
        // Clear existing timer if any
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const interval = types_1.TierIntervals[this.config.tier];
        this.isRunning = true;
        this.timer = setInterval(async () => {
            if (this.isProcessing)
                return;
            this.isProcessing = true;
            try {
                await this.mintTick();
            }
            catch (error) {
                logger_1.logger.error(`[AutoMint] Tick execution failed: ${error instanceof Error ? error.message : error}`);
            }
            finally {
                this.isProcessing = false;
            }
        }, interval);
        logger_1.logger.info(`[AutoMint] Loop started for tier ${this.config.tier} (${interval}ms)`);
    }
    /**
     * 자동 민팅 루프 정지
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        logger_1.logger.info(`[AutoMint] Loop stopped`);
    }
    /**
     * 단일 민트 틱 실행
     * 시간합성 → tokenId 생성 → EVM mint 호출 → 수수료 계산/차감
     */
    async mintTick() {
        // 1. 시간 합성 (Time Synthesis)
        const synthesized = await this.timeSynthesis.synthesize();
        if (!synthesized) {
            logger_1.logger.warn(`[AutoMint] Time synthesis returned null/undefined, skipping tick`);
            return;
        }
        // Fix-12: Integrity check
        if (synthesized.confidence === 0 || synthesized.stratum >= 16) {
            throw new errors_1.TTTTimeSynthesisError(`[AutoMint] Synthesis integrity check failed`, `confidence=${synthesized.confidence}, stratum=${synthesized.stratum}`, `Check NTP sources or network connectivity.`);
        }
        // 1-1. PoT Generation & Validation (W1-1)
        const pot = await this.timeSynthesis.generateProofOfTime();
        if (pot.confidence < 0.5) {
            throw new errors_1.TTTTimeSynthesisError(`[PoT] Insufficient confidence`, `Calculated confidence ${pot.confidence} is below required 0.5`, `Ensure more NTP sources are reachable or decrease uncertainty.`);
        }
        const potHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(JSON.stringify(pot, (key, value) => typeof value === 'bigint' ? value.toString() : value)));
        // 2. tokenId 생성 (keccak256)
        // chainId, poolAddress, timestamp 기반 유니크 ID
        const tokenId = ethers_1.ethers.keccak256(ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address", "uint64"], [BigInt(this.config.chainId), this.config.poolAddress, synthesized.timestamp]));
        // 3. 수수료 계산
        const feeCalculation = await this.feeEngine.calculateMintFee(this.config.tier);
        // 4. EVM mint 호출
        // grgHash는 현재 tokenId를 기반으로 생성 (실제 구현에선 더 복잡한 GRG 페이로드 사용 가능)
        const grgHash = tokenId;
        // 수취인 주소 (기본적으로 signer 주소)
        if (!this.cachedSigner) {
            throw new errors_1.TTTSignerError("[AutoMint] Signer not initialized", "cachedSigner is null", "Initialize the engine before calling mintTick().");
        }
        const recipient = await this.cachedSigner.getAddress();
        logger_1.logger.info(`[AutoMint] Executing mint: tokenId=${tokenId.substring(0, 10)}... amount=${feeCalculation.tttAmount}`);
        const receipt = await this.evmConnector.mintTTT(recipient, feeCalculation.tttAmount, grgHash, potHash);
        // 5. 수수료 차감/기록 (실제 컨트랙트에서 처리되거나 SDK 레벨에서 추적)
        // W2-3: Actual ProtocolFeeCollector call
        if (this.feeCollector && this.config.feeCollectorAddress) {
            try {
                const nonce = BigInt("0x" + (0, crypto_1.randomBytes)(8).toString("hex")); // Cryptographic nonce
                const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
                const signature = await this.signFeeMessage(feeCalculation, nonce, deadline);
                const user = recipient;
                await this.feeCollector.collectMintFee(feeCalculation, signature, user, nonce, deadline);
            }
            catch (feeError) {
                logger_1.logger.error(`[AutoMint] Fee collection failed but mint was successful: ${feeError instanceof Error ? feeError.message : feeError}`);
            }
        }
        logger_1.logger.info(`[AutoMint] Mint success: tx=${receipt.hash}, feePaid=${feeCalculation.protocolFeeUsd} (USDC eq)`);
        if (this.onMintCallback) {
            this.onMintCallback({
                tokenId: tokenId,
                grgHash: grgHash,
                timestamp: synthesized.timestamp,
                txHash: receipt.hash,
                protocolFeePaid: feeCalculation.protocolFeeUsd,
                proofOfTime: pot
            });
        }
    }
    async signFeeMessage(feeCalc, nonce, deadline) {
        if (!this.cachedSigner) {
            throw new errors_1.TTTSignerError("[AutoMint] Signer not initialized", "cachedSigner is null", "Ensure initialize() was called successfully.");
        }
        // Type casting to handle signTypedData if available on the signer (Wallet supports it)
        const signer = this.cachedSigner;
        if (typeof signer.signTypedData !== 'function') {
            throw new errors_1.TTTSignerError("[AutoMint] Provided signer does not support signTypedData (EIP-712)", `Signer type ${signer.constructor.name} missing signTypedData`, "Use a Wallet or a signer that implements EIP-712 signTypedData.");
        }
        const domain = {
            name: "Helm Protocol",
            version: "1",
            chainId: this.config.chainId,
            verifyingContract: this.config.feeCollectorAddress
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
            token: ethers_1.ethers.getAddress(feeCalc.feeTokenAddress),
            amount: feeCalc.protocolFeeUsd,
            nonce: nonce,
            deadline: deadline
        };
        return await signer.signTypedData(domain, types, value);
    }
}
exports.AutoMintEngine = AutoMintEngine;

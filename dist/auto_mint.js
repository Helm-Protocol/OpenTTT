"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoMintEngine = void 0;
const ethers_1 = require("ethers");
const time_synthesis_1 = require("./time_synthesis");
const dynamic_fee_1 = require("./dynamic_fee");
const evm_connector_1 = require("./evm_connector");
const protocol_fee_1 = require("./protocol_fee");
const pot_signer_1 = require("./pot_signer");
const helm_crypto_1 = require("../vendor/helm-crypto");
const types_1 = require("./types");
const logger_1 = require("./logger");
const errors_1 = require("./errors");
/** Maximum retry attempts for RPC-dependent operations within a single tick */
const MINT_TICK_MAX_RETRIES = 3;
/** Backoff durations in ms for each retry attempt (1s, 2s, 4s) */
const MINT_TICK_BACKOFF_MS = [1000, 2000, 4000];
/**
 * AutoMintEngine - Automatic TTT minting engine.
 * Combines time synthesis, dynamic fee calculation, and EVM minting into a single loop.
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
    onFailureCallback;
    onLatencyCallback;
    cachedSigner = null;
    consecutiveFailures = 0;
    maxConsecutiveFailures = 5;
    potSigner = null;
    /** Monotonic counter appended to tokenId hash to prevent collision when two mints share the same nanosecond timestamp. */
    mintNonce = BigInt(Date.now());
    /** Fire the GRG >50ms performance warning at most once per engine session. */
    warnedGrgSlow = false;
    constructor(config) {
        this.config = config;
        this.timeSynthesis = new time_synthesis_1.TimeSynthesis({ sources: config.timeSources });
        this.feeEngine = new dynamic_fee_1.DynamicFeeEngine({
            cacheDurationMs: 5000,
            fallbackPriceUsd: config.fallbackPriceUsd || 10000n,
        });
        this.evmConnector = new evm_connector_1.EVMConnector();
        if (config.signer) {
            this.cachedSigner = config.signer;
        }
        // Initialize Ed25519 PoT signer for non-repudiation
        this.potSigner = config.potSignerKeyPath
            ? pot_signer_1.PotSigner.createOrLoad(config.potSignerKeyPath)
            : new pot_signer_1.PotSigner();
    }
    getEvmConnector() {
        return this.evmConnector;
    }
    getTimeSynthesis() {
        return this.timeSynthesis;
    }
    setOnMint(callback) {
        this.onMintCallback = callback;
    }
    setOnFailure(callback) {
        this.onFailureCallback = callback;
    }
    setOnLatency(callback) {
        this.onLatencyCallback = callback;
    }
    /**
     * Initialize the engine (RPC connection and contract setup).
     */
    async initialize() {
        try {
            const signerOrKey = this.config.signer || this.config.privateKey;
            if (!signerOrKey)
                throw new errors_1.TTTConfigError(errors_1.ERROR_CODES.CONFIG_MISSING_SIGNER, "[AutoMint] Signer or Private Key is required", "Missing both 'signer' and 'privateKey' in config", "Provide a valid ethers.Signer or a private key string in your configuration.");
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
                evm_connector_1.EVMConnector.POT_ANCHORED_EVENT_ABI
            ];
            this.evmConnector.attachContract(this.config.contractAddress, tttAbi);
            if (this.config.feeCollectorAddress) {
                this.feeCollector = new protocol_fee_1.ProtocolFeeCollector(this.config.chainId, this.config.feeCollectorAddress, this.evmConnector, this.config.protocolFeeRecipient);
                await this.feeCollector.validateChainId();
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
     * Start the automatic minting loop.
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
            const tickStart = Date.now();
            try {
                await this.mintTick();
                this.consecutiveFailures = 0;
                // H2: Report latency to TTTClient
                if (this.onLatencyCallback) {
                    this.onLatencyCallback(Date.now() - tickStart);
                }
            }
            catch (error) {
                this.consecutiveFailures++;
                // H2: Report failure to TTTClient
                if (this.onFailureCallback) {
                    this.onFailureCallback(error instanceof Error ? error : new Error(String(error)));
                }
                logger_1.logger.error(`[AutoMint] Tick execution failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error instanceof Error ? error.message : error}`);
                if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                    logger_1.logger.error(`[AutoMint] Circuit breaker triggered: ${this.consecutiveFailures} consecutive failures. Stopping engine to prevent DoS.`);
                    this.stop();
                }
            }
            finally {
                this.isProcessing = false;
            }
        }, interval);
        logger_1.logger.info(`[AutoMint] Loop started for tier ${this.config.tier} (${interval}ms)`);
    }
    /**
     * Stop the automatic minting loop.
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
     * Resume the minting loop after a circuit breaker trip.
     * Resets the consecutive failure counter and restarts the loop.
     */
    resume() {
        this.consecutiveFailures = 0;
        logger_1.logger.info(`[AutoMint] Consecutive failures reset, resuming...`);
        this.start();
    }
    /**
     * Sleep helper for retry backoff.
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Execute a single mint tick.
     * Time synthesis -> tokenId generation -> EVM mint call -> fee calculation/deduction.
     */
    async mintTick() {
        // 1. Time Synthesis
        const synthesized = await this.timeSynthesis.synthesize();
        if (!synthesized) {
            logger_1.logger.warn(`[AutoMint] Time synthesis returned null/undefined, skipping tick`);
            return;
        }
        // Fix-12: Integrity check
        if (synthesized.confidence === 0 || synthesized.stratum >= 16) {
            throw new errors_1.TTTTimeSynthesisError(errors_1.ERROR_CODES.TIME_SYNTHESIS_INTEGRITY_FAILED, `[AutoMint] Synthesis integrity check failed`, `confidence=${synthesized.confidence}, stratum=${synthesized.stratum}`, `Check NTP sources or network connectivity.`);
        }
        // 1-1. PoT Generation & Validation (W1-1)
        const pot = await this.timeSynthesis.generateProofOfTime();
        if (pot.confidence < 0.5) {
            throw new errors_1.TTTTimeSynthesisError(errors_1.ERROR_CODES.TIME_SYNTHESIS_INSUFFICIENT_CONFIDENCE, `[PoT] Insufficient confidence`, `Calculated confidence ${pot.confidence} is below required 0.5`, `Ensure more NTP sources are reachable or decrease uncertainty.`);
        }
        // Deterministic potHash via ABI.encode — field order is fixed,
        // independent of JS engine key ordering. External verifiers can
        // reproduce this hash from the same PoT fields.
        const nonceHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(pot.nonce));
        const potHash = ethers_1.ethers.keccak256(ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["uint64", "uint64", "uint8", "uint8", "uint32", "bytes32"], [
            pot.timestamp,
            pot.expiresAt,
            pot.sources,
            pot.stratum,
            Math.round(pot.confidence * 1_000_000),
            nonceHash
        ]));
        // 1-2. Ed25519 issuer signature for non-repudiation
        if (this.potSigner) {
            pot.issuerSignature = this.potSigner.signPot(potHash);
            logger_1.logger.info(`[AutoMint] PoT signed by issuer ${this.potSigner.getPubKeyHex().substring(0, 16)}...`);
        }
        // 2. Generate tokenId (keccak256)
        // Unique ID based on chainId, poolAddress, timestamp, and a monotonic nonce
        // to prevent collision if two mints occur at the same nanosecond timestamp.
        const nonceSuffix = this.mintNonce;
        this.mintNonce++;
        const tokenId = ethers_1.ethers.keccak256(ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address", "uint64", "uint256"], [BigInt(this.config.chainId), this.config.poolAddress, synthesized.timestamp, nonceSuffix]));
        // 3. Fee calculation
        const feeCalculation = await this.feeEngine.calculateMintFee(this.config.tier);
        // 4. EVM mint call — run GRG integrity pipeline
        const grgPayload = ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32", "uint64", "uint8"], [tokenId, potHash, synthesized.timestamp, pot.sources]);
        const grgStart = Date.now();
        const grgShards = helm_crypto_1.IntegrityEncoder.encode(ethers_1.ethers.getBytes(grgPayload), this.config.chainId, this.config.poolAddress);
        const grgElapsed = Date.now() - grgStart;
        logger_1.logger.info(`[AutoMint] GRG pipeline completed in ${grgElapsed}ms`);
        if (grgElapsed > 50 && !this.warnedGrgSlow) {
            this.warnedGrgSlow = true;
            logger_1.logger.warn(`[AutoMint] GRG pipeline took ${grgElapsed}ms (>50ms threshold). Consider offloading to a Worker Thread for T3_micro tiers.`);
        }
        // On-chain hash = keccak256 of concatenated GRG-encoded shards
        const grgHash = ethers_1.ethers.keccak256(ethers_1.ethers.concat(grgShards));
        // Recipient address (defaults to signer address)
        if (!this.cachedSigner) {
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_NOT_INITIALIZED, "[AutoMint] Signer not initialized", "cachedSigner is null", "Initialize the engine before calling mintTick().");
        }
        const recipient = await this.cachedSigner.getAddress();
        logger_1.logger.info(`[AutoMint] Executing mint: tokenId=${tokenId.substring(0, 10)}... amount=${feeCalculation.tttAmount}`);
        // Retry loop for RPC-dependent mint operation (max 3 attempts, backoff 1s/2s/4s)
        let receipt;
        let lastError = null;
        for (let attempt = 0; attempt < MINT_TICK_MAX_RETRIES; attempt++) {
            try {
                receipt = await this.evmConnector.mintTTT(recipient, feeCalculation.tttAmount, grgHash, potHash);
                lastError = null;
                break;
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (attempt < MINT_TICK_MAX_RETRIES - 1) {
                    const backoff = MINT_TICK_BACKOFF_MS[attempt];
                    logger_1.logger.warn(`[AutoMint] Mint attempt ${attempt + 1}/${MINT_TICK_MAX_RETRIES} failed, retrying in ${backoff}ms: ${lastError.message}`);
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
                const feeContract = new ethers_1.ethers.Contract(this.config.feeCollectorAddress, ["function getNonce(address) external view returns (uint256)"], this.evmConnector.getProvider());
                const nonce = BigInt(await feeContract.getNonce(recipient));
                const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
                const signature = await this.signFeeMessage(feeCalculation, nonce, deadline);
                const user = recipient;
                await this.feeCollector.collectMintFee(feeCalculation, signature, user, nonce, deadline);
            }
            catch (feeError) {
                logger_1.logger.error(`[AutoMint] Fee collection failed but mint was successful: ${feeError instanceof Error ? feeError.message : feeError}`);
                // Reset to 0 so downstream (onMint callback, ledger) does not record a fee that was never collected
                actualFeePaid = 0n;
            }
        }
        // CT Log equivalent: log PoT anchor info for subgraph indexers
        logger_1.logger.info(`[AutoMint] PoTAnchored: timestamp=${synthesized.timestamp}, grgHash=${grgHash}, stratum=${synthesized.stratum}, potHash=${potHash}`);
        logger_1.logger.info(`[AutoMint] Mint success: tx=${receipt.hash}, feePaid=${actualFeePaid} (USDC eq)`);
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
    async signFeeMessage(feeCalc, nonce, deadline) {
        if (!this.cachedSigner) {
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_NOT_INITIALIZED, "[AutoMint] Signer not initialized", "cachedSigner is null", "Ensure initialize() was called successfully.");
        }
        // Type casting to handle signTypedData if available on the signer (Wallet supports it)
        const signer = this.cachedSigner;
        if (typeof signer.signTypedData !== 'function') {
            throw new errors_1.TTTSignerError(errors_1.ERROR_CODES.SIGNER_NO_EIP712, "[AutoMint] Provided signer does not support signTypedData (EIP-712)", `Signer type ${signer.constructor.name} missing signTypedData`, "Use a Wallet or a signer that implements EIP-712 signTypedData.");
        }
        const domain = {
            name: "OpenTTT_ProtocolFee",
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

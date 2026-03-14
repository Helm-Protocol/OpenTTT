"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTTClient = void 0;
const ethers_1 = require("ethers");
const auto_mint_1 = require("./auto_mint");
const logger_1 = require("./logger");
const pool_registry_1 = require("./pool_registry");
const networks_1 = require("./networks");
const signer_1 = require("./signer");
/**
 * TTTClient - DEX 운영자용 SDK 진입점
 * 모든 내부 모듈을 초기화하고 자동 민팅 프로세스를 관리
 */
class TTTClient {
    config;
    autoMintEngine;
    poolRegistry;
    isInitialized = false;
    mintCount = 0;
    mintFailures = 0;
    totalFeesPaid = 0n;
    signer = null;
    lastTokenId = null;
    mintLatencies = [];
    lastMintAt = null;
    startedAt = new Date();
    minBalanceWei = ethers_1.ethers.parseEther("0.01"); // 0.01 ETH alert threshold
    onAlertCallback;
    constructor(config) {
        this.config = config;
        this.autoMintEngine = new auto_mint_1.AutoMintEngine(config);
        this.poolRegistry = new pool_registry_1.PoolRegistry();
        // Set up callback to update stats + metrics
        this.autoMintEngine.setOnMint((result) => {
            this.mintCount++;
            this.totalFeesPaid += result.protocolFeePaid;
            this.lastTokenId = result.tokenId;
            this.lastMintAt = new Date();
            // Record in registry
            this.poolRegistry.recordMint(this.config.poolAddress, 1n);
        });
        // H2: Wire failure/latency metrics from AutoMint loop to TTTClient
        this.autoMintEngine.setOnFailure((_error) => {
            this.mintFailures++;
        });
        this.autoMintEngine.setOnLatency((ms) => {
            this.mintLatencies.push(ms);
            if (this.mintLatencies.length > 100) {
                this.mintLatencies.shift();
            }
        });
    }
    /**
     * Static factory for Base Mainnet
     */
    static async forBase(config) {
        return this.create({ ...config, network: 'base' });
    }
    /**
     * Static factory for Base Sepolia
     */
    static async forSepolia(config) {
        return this.create({ ...config, network: 'sepolia' });
    }
    /**
     * Universal factory to create and initialize a client
     */
    static async create(config) {
        // 1. Resolve network defaults
        let net;
        if (typeof config.network === 'string') {
            net = networks_1.NETWORKS[config.network] || networks_1.NETWORKS.base;
        }
        else if (config.network) {
            net = config.network;
        }
        else {
            net = networks_1.NETWORKS.base;
        }
        // 2. Create signer via abstraction
        const abstractSigner = await (0, signer_1.createSigner)(config.signer);
        const signer = abstractSigner.inner;
        // 2.5. Validate addresses — prevent accidental mainnet zero-address usage
        const contractAddr = config.contractAddress || net.tttAddress;
        if (contractAddr === "0x0000000000000000000000000000000000000000") {
            throw new Error("[TTTClient] TTT contract address is zero address. On Base Mainnet, you must provide contractAddress in config (contracts not yet deployed).");
        }
        // 3. Build AutoMintConfig from TTTClientConfig + defaults
        const autoMintConfig = {
            chainId: net.chainId,
            rpcUrl: config.rpcUrl || net.rpcUrl,
            signer: signer,
            contractAddress: config.contractAddress || net.tttAddress,
            feeCollectorAddress: net.protocolFeeAddress,
            poolAddress: config.poolAddress || "0x0000000000000000000000000000000000000000",
            tier: config.tier || "T1_block",
            timeSources: config.timeSources || ["nist", "kriss", "google"],
            protocolFeeRate: config.protocolFeeRate || 0.05,
            protocolFeeRecipient: config.protocolFeeRecipient || "0x0000000000000000000000000000000000000000",
            fallbackPriceUsd: config.fallbackPriceUsd || 10000n,
        };
        // 4. Instantiate and initialize
        const client = new TTTClient(autoMintConfig);
        await client.initialize();
        if (config.enableGracefulShutdown) {
            process.on('SIGINT', async () => {
                logger_1.logger.info("[TTTClient] SIGINT received, shutting down gracefully...");
                await client.destroy();
                process.exit(0);
            });
        }
        return client;
    }
    /**
     * Gracefully shuts down the SDK, stopping all background processes and listeners.
     */
    async destroy() {
        if (!this.isInitialized)
            return;
        logger_1.logger.info("[TTTClient] Destroying client...");
        // 1. Stop auto-mint engine
        this.autoMintEngine.stop();
        // 2. Unsubscribe all event listeners
        this.autoMintEngine.getEvmConnector().unsubscribeAll();
        // 3. Clear local state
        this.isInitialized = false;
        this.signer = null;
        logger_1.logger.info("[TTTClient] Client destroyed successfully.");
    }
    /**
     * SDK 초기화: RPC 연결, 시간 소스 설정, 수수료 엔진 연결
     */
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            logger_1.logger.info(`[TTTClient] Initializing for chain ${this.config.chainId}...`);
            await this.autoMintEngine.initialize();
            const connector = this.autoMintEngine.getEvmConnector();
            this.signer = connector.getSigner();
            // Register initial pool
            await this.poolRegistry.registerPool(this.config.chainId, this.config.poolAddress);
            // R2-P2-2: Validate feeCollectorAddress early before use
            if (this.config.feeCollectorAddress && !ethers_1.ethers.isAddress(this.config.feeCollectorAddress)) {
                throw new Error(`[TTTClient] Invalid feeCollectorAddress: ${this.config.feeCollectorAddress}`);
            }
            // Attach ProtocolFee contract if address is provided
            if (this.config.feeCollectorAddress) {
                const protocolFeeAbi = [
                    "event FeeCollected(address indexed payer, uint256 amount, uint256 nonce)"
                ];
                connector.attachProtocolFeeContract(this.config.feeCollectorAddress, protocolFeeAbi);
            }
            // Subscribe to events
            await connector.subscribeToEvents({
                onMinted: async (to, tokenId, amount) => {
                    logger_1.logger.info(`[TTTClient] Event: TTTMinted to ${to}, tokenId: ${tokenId}, amount: ${amount}`);
                    const myAddr = await this.signer?.getAddress();
                    if (to.toLowerCase() === myAddr?.toLowerCase()) {
                        // Logic could go here to update local state
                    }
                },
                onBurned: (from, tokenId, amount, tier) => {
                    logger_1.logger.info(`[TTTClient] Event: TTTBurned from ${from}, tokenId: ${tokenId}, amount: ${amount}, tier: ${tier}`);
                    this.poolRegistry.recordBurn(this.config.poolAddress, amount);
                },
                onFeeCollected: (payer, amount, nonce) => {
                    logger_1.logger.info(`[TTTClient] Event: FeeCollected from ${payer}, amount: ${amount}, nonce: ${nonce}`);
                }
            });
            this.isInitialized = true;
            logger_1.logger.info(`[TTTClient] SDK initialized successfully`);
        }
        catch (error) {
            this.isInitialized = false;
            this.signer = null;
            logger_1.logger.error(`[TTTClient] Initialization failed, state rolled back: ${error}`);
            throw error;
        }
    }
    /**
     * 자동 민팅 프로세스 시작
     */
    startAutoMint() {
        if (!this.isInitialized) {
            throw new Error("SDK must be initialized before starting auto-mint");
        }
        this.autoMintEngine.start();
        logger_1.logger.info(`[TTTClient] Auto-minting started for tier ${this.config.tier}`);
    }
    /**
     * 자동 민팅 프로세스 정지
     */
    stopAutoMint() {
        this.autoMintEngine.stop();
    }
    /**
     * List registered pools.
     */
    listPools() {
        return this.poolRegistry.listPools();
    }
    /**
     * Get stats for a specific pool.
     */
    getPoolStats(poolAddress) {
        return this.poolRegistry.getPoolStats(poolAddress);
    }
    /**
     * Set minimum ETH balance threshold for health alerts.
     */
    setMinBalance(weiAmount) {
        this.minBalanceWei = weiAmount;
    }
    /**
     * Register alert callback for real-time notifications.
     */
    onAlert(callback) {
        this.onAlertCallback = callback;
    }
    emitAlert(alert) {
        logger_1.logger.warn(`[TTTClient] ALERT: ${alert}`);
        if (this.onAlertCallback) {
            try {
                this.onAlertCallback(alert);
            }
            catch (_) { /* swallow */ }
        }
    }
    /**
     * Record a mint failure (called internally or externally).
     */
    recordMintFailure() {
        this.mintFailures++;
    }
    /**
     * Record mint latency in ms (called from auto-mint wrapper).
     */
    recordMintLatency(ms) {
        this.mintLatencies.push(ms);
        // Keep last 100 entries
        if (this.mintLatencies.length > 100) {
            this.mintLatencies.shift();
        }
    }
    /**
     * Production health check — liveness + readiness + metrics.
     * No exceptions: always returns a HealthStatus object.
     */
    async getHealth() {
        const alerts = [];
        let rpcConnected = false;
        let balanceSufficient = false;
        let ntpSourcesOk = true; // Assume ok unless we can verify
        // 1. RPC connectivity check
        if (this.isInitialized && this.signer?.provider) {
            try {
                const blockNumber = await this.signer.provider.getBlockNumber();
                rpcConnected = blockNumber > 0;
            }
            catch {
                rpcConnected = false;
                alerts.push("RPC connection failed");
            }
        }
        // 2. Balance check
        if (this.isInitialized && this.signer?.provider) {
            try {
                const address = await this.signer.getAddress();
                const balance = await this.signer.provider.getBalance(address);
                balanceSufficient = balance >= this.minBalanceWei;
                if (!balanceSufficient) {
                    alerts.push(`ETH balance low: ${ethers_1.ethers.formatEther(balance)} ETH (min: ${ethers_1.ethers.formatEther(this.minBalanceWei)})`);
                }
            }
            catch {
                alerts.push("Balance check failed");
            }
        }
        // 3. Consecutive failure check
        const total = this.mintCount + this.mintFailures;
        const successRate = total > 0 ? this.mintCount / total : 1;
        if (this.mintFailures > 5 && successRate < 0.8) {
            alerts.push(`High mint failure rate: ${this.mintFailures} failures, ${(successRate * 100).toFixed(1)}% success`);
        }
        // 4. Avg latency
        const avgLatency = this.mintLatencies.length > 0
            ? this.mintLatencies.reduce((a, b) => a + b, 0) / this.mintLatencies.length
            : 0;
        // 5. Uptime
        const uptimeMs = Date.now() - this.startedAt.getTime();
        // Emit alerts
        for (const alert of alerts) {
            this.emitAlert(alert);
        }
        const healthy = this.isInitialized && rpcConnected && balanceSufficient && alerts.length === 0;
        return {
            healthy,
            checks: {
                initialized: this.isInitialized,
                rpcConnected,
                signerAvailable: this.signer !== null,
                balanceSufficient,
                ntpSourcesOk,
            },
            metrics: {
                mintCount: this.mintCount,
                mintFailures: this.mintFailures,
                successRate: Math.round(successRate * 1000) / 1000,
                totalFeesPaid: this.totalFeesPaid.toString(),
                avgMintLatencyMs: Math.round(avgLatency),
                lastMintAt: this.lastMintAt?.toISOString() ?? null,
                uptimeMs,
            },
            alerts,
        };
    }
    /**
     * 현재 SDK 상태 및 통계 반환 (잔고, 민팅 수, 수수료 등)
     */
    async getStatus() {
        if (!this.isInitialized || !this.signer) {
            throw new Error("SDK must be initialized before getting status");
        }
        const provider = this.signer.provider;
        if (!provider) {
            throw new Error("Signer provider is not available");
        }
        const address = await this.signer.getAddress();
        const balance = await provider.getBalance(address);
        const formattedBalance = ethers_1.ethers.formatEther(balance);
        let tttBalance = 0n;
        if (this.lastTokenId) {
            try {
                tttBalance = await this.autoMintEngine.getEvmConnector().getTTTBalance(address, BigInt(this.lastTokenId));
            }
            catch (e) {
                logger_1.logger.error(`[TTTClient] Failed to fetch TTT balance: ${e}`);
            }
        }
        return {
            isInitialized: this.isInitialized,
            tier: this.config.tier,
            mintCount: this.mintCount,
            totalFeesPaid: this.totalFeesPaid.toString(),
            balance: formattedBalance,
            tttBalance: tttBalance.toString(),
            lastTokenId: this.lastTokenId
        };
    }
}
exports.TTTClient = TTTClient;

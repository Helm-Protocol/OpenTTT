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
    totalFeesPaid = 0n;
    signer = null;
    lastTokenId = null;
    constructor(config) {
        this.config = config;
        this.autoMintEngine = new auto_mint_1.AutoMintEngine(config);
        this.poolRegistry = new pool_registry_1.PoolRegistry();
        // Set up callback to update stats
        this.autoMintEngine.setOnMint((result) => {
            this.mintCount++;
            this.totalFeesPaid += result.protocolFeePaid;
            this.lastTokenId = result.tokenId;
            // Record in registry
            this.poolRegistry.recordMint(this.config.poolAddress, 1n); // Assuming 1 TTT per mint for stats
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
        return client;
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
        else {
            // Try to fetch balance for a generic token ID if possible, 
            // or just return 0 if no tokens minted yet in this session.
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

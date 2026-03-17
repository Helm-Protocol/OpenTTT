"use strict";
// sdk/src/evm_connector.ts — Production EVM Chain Connector
// Supports EIP-1559, Gas Estimation, and TTT Operations.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMConnector = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("./logger");
const errors_1 = require("./errors");
class EVMConnector {
    provider = null;
    signer = null;
    tttContract = null;
    protocolFeeContract = null;
    eventListeners = []; // P2-6: Track listeners for cleanup
    // P1-7: Timeout wrapper for gas estimation
    static GAS_TIMEOUT_MS = 5000;
    primaryRpcUrl = "";
    fallbackRpcUrls = [];
    signerOrKey = null;
    maxReconnectAttempts;
    connected = false;
    constructor(options) {
        this.fallbackRpcUrls = options?.fallbackRpcUrls ?? [];
        this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 3;
    }
    /**
     * P1-7: Race estimateGas against timeout to prevent DoS
     */
    async withTimeout(promise, ms = EVMConnector.GAS_TIMEOUT_MS) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_CONNECTION_FAILED, `[EVM] Operation timed out`, `RPC did not respond within ${ms}ms`, `Check your RPC provider status or increase timeout.`)), ms))
        ]);
    }
    /**
     * Connect to an EVM chain using either a private key or a pre-configured signer.
     */
    async connect(rpcUrl, signerOrKey) {
        if (!rpcUrl || typeof rpcUrl !== "string")
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_INVALID_RPC, "[EVM] Invalid RPC URL", "The provided RPC URL is empty or not a string", "Pass a valid RPC URL (e.g., https://mainnet.base.org)");
        this.primaryRpcUrl = rpcUrl;
        this.signerOrKey = signerOrKey;
        try {
            this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
            if (typeof signerOrKey === "string") {
                if (!signerOrKey.startsWith("0x") || signerOrKey.length !== 66) {
                    throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_INVALID_KEY_FORMAT, "[EVM] Invalid Private Key format", "Private key must be 0x + 64 hex characters", "Provide a valid 32-byte hex private key.");
                }
                this.signer = new ethers_1.ethers.Wallet(signerOrKey, this.provider);
            }
            else {
                this.signer = signerOrKey.connect ? signerOrKey.connect(this.provider) : signerOrKey;
            }
            const network = await this.provider.getNetwork();
            this.connected = true;
            logger_1.logger.info(`[EVM] Connected to Chain ID: ${network.chainId}`);
        }
        catch (error) {
            if (error instanceof errors_1.TTTContractError || error instanceof errors_1.TTTNetworkError)
                throw error;
            // Try fallback RPCs before giving up
            for (const fallback of this.fallbackRpcUrls) {
                try {
                    logger_1.logger.warn(`[EVM] Primary RPC failed, trying fallback: ${fallback}`);
                    this.provider = new ethers_1.JsonRpcProvider(fallback);
                    if (typeof signerOrKey === "string") {
                        this.signer = new ethers_1.ethers.Wallet(signerOrKey, this.provider);
                    }
                    else {
                        this.signer = signerOrKey.connect ? signerOrKey.connect(this.provider) : signerOrKey;
                    }
                    const network = await this.provider.getNetwork();
                    this.connected = true;
                    logger_1.logger.info(`[EVM] Connected via fallback to Chain ID: ${network.chainId}`);
                    return;
                }
                catch {
                    continue;
                }
            }
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_CONNECTION_FAILED, `[EVM] Connection failed`, error instanceof Error ? error.message : String(error), `Verify your RPC URL and network connectivity.`);
        }
    }
    /**
     * Reconnect using stored credentials. Tries primary first, then fallbacks.
     */
    async reconnect() {
        if (!this.signerOrKey)
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_CANNOT_RECONNECT, "[EVM] Cannot reconnect", "No previous connection credentials stored", "Call connect() first.");
        this.disconnect();
        const allUrls = [this.primaryRpcUrl, ...this.fallbackRpcUrls].filter(Boolean);
        for (let attempt = 0; attempt < Math.min(this.maxReconnectAttempts, allUrls.length); attempt++) {
            try {
                const url = allUrls[attempt % allUrls.length];
                logger_1.logger.info(`[EVM] Reconnect attempt ${attempt + 1}/${this.maxReconnectAttempts} → ${url}`);
                this.provider = new ethers_1.JsonRpcProvider(url);
                if (typeof this.signerOrKey === "string") {
                    this.signer = new ethers_1.ethers.Wallet(this.signerOrKey, this.provider);
                }
                else {
                    this.signer = this.signerOrKey.connect ? this.signerOrKey.connect(this.provider) : this.signerOrKey;
                }
                await this.provider.getNetwork();
                this.connected = true;
                logger_1.logger.info(`[EVM] Reconnected successfully`);
                return;
            }
            catch {
                logger_1.logger.warn(`[EVM] Reconnect attempt ${attempt + 1} failed`);
            }
        }
        this.connected = false;
        throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_RECONNECTION_EXHAUSTED, "[EVM] Reconnection failed", `All ${this.maxReconnectAttempts} attempts exhausted`, "Check RPC provider status and network connectivity.");
    }
    /**
     * Disconnect and release all resources.
     */
    disconnect() {
        this.unsubscribeAll();
        if (this.provider) {
            this.provider.destroy();
        }
        this.provider = null;
        this.signer = null;
        this.tttContract = null;
        this.protocolFeeContract = null;
        this.connected = false;
        logger_1.logger.info("[EVM] Disconnected and resources released");
    }
    /**
     * Check if the connector is currently connected.
     */
    isConnected() {
        return this.connected && this.provider !== null;
    }
    /**
     * CT Log Equivalent: PoTAnchored event ABI fragment.
     * Every Proof-of-Time anchor is publicly auditable on-chain,
     * analogous to Certificate Transparency logs in TLS.
     */
    static POT_ANCHORED_EVENT_ABI = "event PoTAnchored(uint64 indexed timestamp, bytes32 grgHash, uint8 stratum, bytes32 potHash)";
    /**
     * Attach the TTT Token contract.
     */
    attachContract(address, abi) {
        if (!this.signer)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_SIGNER_NOT_CONNECTED, "Not connected to signer", "EVMConnector.connect() must be called first", "Initialize connection before attaching contracts.");
        if (!address || !ethers_1.ethers.isAddress(address))
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_INVALID_ADDRESS, `[EVM] Invalid contract address`, `Address '${address}' is not a valid EVM address`, `Check your config and provide a valid checksummed address.`);
        this.tttContract = new ethers_1.Contract(address, abi, this.signer);
    }
    /**
     * Attach the ProtocolFee contract.
     */
    attachProtocolFeeContract(address, abi) {
        if (!this.signer)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_SIGNER_NOT_CONNECTED, "Not connected to signer", "EVMConnector.connect() must be called first", "Initialize connection before attaching contracts.");
        if (!address || !ethers_1.ethers.isAddress(address))
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_INVALID_ADDRESS, `[EVM] Invalid contract address`, `Address '${address}' is not a valid EVM address`, `Check your config and provide a valid checksummed address.`);
        this.protocolFeeContract = new ethers_1.Contract(address, abi, this.signer);
    }
    /**
     * Generic TTT Record Submission (Burn)
     */
    async submitTTTRecord(record, amount, tier) {
        if (!this.tttContract)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_NOT_ATTACHED, "Contract not attached", "TTT contract instance is null", "Call attachContract() with valid TTT address before burning.");
        const grgHash = ethers_1.ethers.keccak256(ethers_1.ethers.concat(record.grgPayload));
        try {
            // P1-7: Gas estimation with timeout
            const gasLimit = await this.withTimeout(this.tttContract.burn.estimateGas(amount, grgHash, tier));
            const tx = await this.tttContract.burn(amount, grgHash, tier, {
                gasLimit: (gasLimit * 120n) / 100n
            });
            logger_1.logger.info(`[EVM] TTT Record TX Sent: ${tx.hash}`);
            const receipt = await tx.wait();
            // P2-5: Null check for dropped transactions
            if (!receipt)
                throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_TX_DROPPED, `[EVM] Transaction failed`, `Transaction was dropped from mempool or null receipt`, `Check block explorer for tx status.`);
            return receipt;
        }
        catch (error) {
            if (error instanceof errors_1.TTTNetworkError || error instanceof errors_1.TTTContractError)
                throw error;
            const reason = this.extractRevertReason(error);
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_BURN_FAILED, `[EVM] Burn failed`, reason, `Verify your TTT balance and tier parameters.`);
        }
    }
    /**
     * Mint TTT (Owner only)
     */
    async mintTTT(to, amount, grgHash, potHash) {
        if (!this.tttContract)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_NOT_ATTACHED, "Contract not attached", "TTT contract instance is null", "Call attachContract() before minting.");
        if (!to || !ethers_1.ethers.isAddress(to))
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_INVALID_ADDRESS, `[EVM] Invalid recipient address`, `Address '${to}' is not a valid EVM address`, `Provide a valid destination address.`);
        try {
            if (potHash) {
                logger_1.logger.info(`[EVM] Recording PoT fingerprint: ${potHash}`);
            }
            // Gas estimation with 20% buffer and timeout (matching burnTTT pattern)
            const gasLimit = await this.withTimeout(this.tttContract.mint.estimateGas(to, amount, grgHash));
            const tx = await this.tttContract.mint(to, amount, grgHash, {
                gasLimit: (gasLimit * 120n) / 100n
            });
            const receipt = await tx.wait();
            if (!receipt)
                throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_TX_DROPPED, `[EVM] Mint TX dropped`, `Transaction was dropped from mempool`, `Check operator account for nonce collisions.`);
            return receipt;
        }
        catch (error) {
            const reason = this.extractRevertReason(error);
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_MINT_FAILED, `[EVM] Mint failed`, reason, `Ensure operator has minter role and sufficient gas.`);
        }
    }
    /**
     * Burn TTT (Simple wrapper)
     */
    async burnTTT(amount, grgHash, tierLevel) {
        if (!this.tttContract)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_NOT_ATTACHED, "Contract not attached", "TTT contract instance is null", "Call attachContract() before burning.");
        try {
            const tx = await this.tttContract.burn(amount, grgHash, tierLevel);
            const receipt = await tx.wait();
            if (!receipt)
                throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_TX_DROPPED, `[EVM] Burn TX dropped`, `Transaction was dropped from mempool`, `Verify account balance.`);
            return { hash: receipt.hash };
        }
        catch (error) {
            const reason = this.extractRevertReason(error);
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_BURN_FAILED, `[EVM] Burn failed`, reason, `Check TTT balance.`);
        }
    }
    /**
     * Get TTT Balance (ERC-1155)
     */
    async getTTTBalance(user, tokenId) {
        if (!this.tttContract)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_NOT_ATTACHED, "Contract not attached", "TTT contract instance is null", "Call attachContract() before querying balance.");
        try {
            return await this.tttContract.balanceOf(user, tokenId);
        }
        catch (error) {
            const reason = this.extractRevertReason(error);
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_BALANCE_QUERY_FAILED, `[EVM] Balance query failed`, reason, `Check RPC connection and contract address.`);
        }
    }
    /**
     * Swap tokens on a DEX (Uniswap V4 Simulation)
     */
    async swap(routerAddress, tokenIn, tokenOut, amountIn, minAmountOut) {
        if (!this.signer)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_SIGNER_NOT_CONNECTED, "Not connected to signer", "Signer is null", "Initialize connection.");
        if (!routerAddress || !ethers_1.ethers.isAddress(routerAddress))
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_INVALID_ADDRESS, `[EVM] Invalid router address`, `Address '${routerAddress}' is invalid`, `Provide valid V4 SwapRouter address.`);
        logger_1.logger.info(`[EVM] Swapping ${amountIn} of ${tokenIn} for ${tokenOut} via ${routerAddress}`);
        // Realistic Uniswap V4-like SwapRouter ABI for simulation/integration
        const swapRouterAbi = [
            "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256)"
        ];
        const routerContract = new ethers_1.ethers.Contract(routerAddress, swapRouterAbi, this.signer);
        try {
            // P1-7: Gas estimation with timeout
            const gasLimit = await this.withTimeout(routerContract.swap.estimateGas(tokenIn, tokenOut, amountIn, minAmountOut));
            const tx = await routerContract.swap(tokenIn, tokenOut, amountIn, minAmountOut, {
                gasLimit: (gasLimit * 120n) / 100n
            });
            logger_1.logger.info(`[EVM] Swap TX Sent: ${tx.hash}`);
            const receipt = await tx.wait();
            if (!receipt)
                throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_TX_DROPPED, `[EVM] Swap TX dropped`, `Transaction dropped`, `Check gas price.`);
            return receipt;
        }
        catch (error) {
            if (error instanceof errors_1.TTTNetworkError || error instanceof errors_1.TTTContractError)
                throw error;
            const reason = this.extractRevertReason(error);
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_SWAP_FAILED, `[EVM] Swap failed`, reason, `Verify slippage and token balances.`);
        }
    }
    /**
     * Subscribe to TTT and Fee events.
     */
    async subscribeToEvents(callbacks) {
        // R2-P1-1: Auto-cleanup previous listeners before re-subscribing (idempotency)
        if (this.eventListeners.length > 0) {
            this.unsubscribeAll();
        }
        if (this.tttContract) {
            if (callbacks.onMinted) {
                const handler = (to, tokenId, amount) => {
                    callbacks.onMinted(to, tokenId, amount);
                };
                this.tttContract.on("TTTMinted", handler);
                // R6-P1-2: Store direct handler reference for reliable .off() cleanup
                const contract = this.tttContract;
                this.eventListeners.push(() => contract.off("TTTMinted", handler));
            }
            if (callbacks.onBurned) {
                const handler = (from, tokenId, amount, tier) => {
                    callbacks.onBurned(from, tokenId, amount, tier);
                };
                this.tttContract.on("TTTBurned", handler);
                const contract = this.tttContract;
                this.eventListeners.push(() => contract.off("TTTBurned", handler));
            }
        }
        if (this.protocolFeeContract && callbacks.onFeeCollected) {
            const handler = (payer, amount, nonce) => {
                callbacks.onFeeCollected(payer, amount, nonce);
            };
            this.protocolFeeContract.on("FeeCollected", handler);
            const contract = this.protocolFeeContract;
            this.eventListeners.push(() => contract.off("FeeCollected", handler));
        }
        logger_1.logger.info("[EVM] Subscribed to TTT and Fee events");
    }
    /**
     * P2-6: Unsubscribe all event listeners to prevent memory leaks.
     */
    unsubscribeAll() {
        for (const unsub of this.eventListeners) {
            try {
                unsub();
            }
            catch { /* already removed */ }
        }
        this.eventListeners = [];
        logger_1.logger.info(`[EVM] All event listeners unsubscribed`);
    }
    /**
     * Verify Block Data
     */
    async verifyBlock(blockNum) {
        if (!this.provider)
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_PROVIDER_NOT_CONNECTED, "Provider not connected", "RPC provider is null", "Call connect() first.");
        const block = await this.provider.getBlock(blockNum);
        if (!block)
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_BLOCK_NOT_FOUND, `Block not found`, `RPC returned null for block ${blockNum}`, `Verify if block number exists on chain.`);
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
    async getPendingTransactions() {
        if (!this.provider)
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_PROVIDER_NOT_CONNECTED, "Provider not connected", "RPC provider is null", "Call connect() first.");
        const block = await this.provider.send("eth_getBlockByNumber", ["pending", false]);
        return block ? block.transactions : [];
    }
    /**
     * Get the provider instance.
     */
    getProvider() {
        if (!this.provider)
            throw new errors_1.TTTNetworkError(errors_1.ERROR_CODES.NETWORK_PROVIDER_NOT_CONNECTED, "Provider not connected", "RPC provider is null", "Call connect() first.");
        return this.provider;
    }
    /**
     * Get the signer instance.
     */
    getSigner() {
        if (!this.signer)
            throw new errors_1.TTTContractError(errors_1.ERROR_CODES.CONTRACT_SIGNER_NOT_CONNECTED, "Signer not connected", "Signer is null", "Call connect() first.");
        return this.signer;
    }
    /**
     * Extract human-readable revert reason from ethers error.
     */
    extractRevertReason(error) {
        if (error && typeof error === "object") {
            const e = error;
            if (typeof e.reason === "string")
                return e.reason;
            if (e.data && typeof e.data === "object" && typeof e.data.message === "string")
                return e.data.message;
            if (typeof e.message === "string")
                return e.message;
        }
        return String(error ?? "Unknown EVM error");
    }
}
exports.EVMConnector = EVMConnector;

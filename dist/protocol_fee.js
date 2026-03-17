"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolFeeCollector = exports.InMemoryReplayCache = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("./logger");
/**
 * Default in-memory replay cache with bounded size and TTL eviction.
 * Suitable for single-process deployments; use a distributed ReplayCache
 * implementation (e.g., Redis) for multi-node setups.
 */
class InMemoryReplayCache {
    entries = new Map();
    maxEntries;
    defaultTtlMs;
    lastPruneTime = 0;
    static PRUNE_INTERVAL_MS = 60000;
    constructor(maxEntries = 10000, defaultTtlMs = 3600000) {
        this.maxEntries = maxEntries;
        this.defaultTtlMs = defaultTtlMs;
    }
    async has(key) {
        this.pruneIfNeeded();
        const ts = this.entries.get(key);
        if (ts === undefined)
            return false;
        if (Date.now() - ts > this.defaultTtlMs) {
            this.entries.delete(key);
            return false;
        }
        return true;
    }
    async set(key, ttlMs) {
        this.pruneIfNeeded();
        this.entries.set(key, Date.now());
    }
    pruneIfNeeded() {
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
exports.InMemoryReplayCache = InMemoryReplayCache;
/**
 * ProtocolFeeCollector - Handles Helm protocol fee collection and verification.
 * Includes EIP-712 signature verification for x402 compliance.
 */
class ProtocolFeeCollector {
    totalCollected = 0n;
    chainId;
    verifyingContract;
    replayCache;
    evmConnector;
    protocolFeeRecipient;
    feeContract = null;
    constructor(chainId, verifyingContract, evmConnector, protocolFeeRecipient, replayCache) {
        // R3-P0-2: Validate chainId is a positive integer to prevent cross-chain replay
        if (!Number.isInteger(chainId) || chainId <= 0) {
            throw new Error(`[ProtocolFee] Invalid chainId: ${chainId}. Must be a positive integer.`);
        }
        this.chainId = chainId;
        this.verifyingContract = ethers_1.ethers.getAddress(verifyingContract);
        this.evmConnector = evmConnector;
        this.protocolFeeRecipient = ethers_1.ethers.getAddress(protocolFeeRecipient);
        this.replayCache = replayCache ?? new InMemoryReplayCache();
    }
    /**
     * R3-P0-2: Verify chainId matches the actual connected network.
     * Must be called after EVMConnector.connect() to prevent cross-chain signature replay.
     */
    async validateChainId() {
        const provider = this.evmConnector.getProvider();
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== this.chainId) {
            throw new Error(`[ProtocolFee] Chain ID mismatch: configured ${this.chainId}, network reports ${network.chainId}. Cross-chain replay risk!`);
        }
    }
    getFeeContract() {
        if (this.feeContract)
            return this.feeContract;
        const abi = [
            "function collectFee(address token, uint256 amount, bytes calldata signature, uint256 nonce, uint256 deadline) external"
        ];
        // ProtocolFeeCollector uses verifyingContract as the ProtocolFee.sol address
        this.feeContract = new ethers_1.ethers.Contract(this.verifyingContract, abi, this.evmConnector.getSigner());
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
    async collectMintFee(feeCalc, signature, user, nonce, deadline) {
        try {
            await this.verifySignature(feeCalc, signature, user, nonce, deadline);
            // Actual on-chain collection
            const contract = this.getFeeContract();
            const tx = await contract.collectFee(ethers_1.ethers.getAddress(feeCalc.feeTokenAddress), feeCalc.protocolFeeUsd, signature, nonce, deadline);
            await tx.wait();
            this.totalCollected += feeCalc.protocolFeeUsd;
            logger_1.logger.info(`[ProtocolFee] Mint fee collected on-chain: ${feeCalc.protocolFeeUsd} ${feeCalc.feeToken}. TX: ${tx.hash}`);
        }
        catch (error) {
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
    async collectBurnFee(feeCalc, signature, user, nonce, deadline) {
        try {
            await this.verifySignature(feeCalc, signature, user, nonce, deadline);
            // Actual on-chain collection
            const contract = this.getFeeContract();
            const tx = await contract.collectFee(ethers_1.ethers.getAddress(feeCalc.feeTokenAddress), feeCalc.protocolFeeUsd, signature, nonce, deadline);
            await tx.wait();
            this.totalCollected += feeCalc.protocolFeeUsd;
            logger_1.logger.info(`[ProtocolFee] Burn fee collected on-chain: ${feeCalc.protocolFeeUsd} ${feeCalc.feeToken}. TX: ${tx.hash}`);
        }
        catch (error) {
            throw new Error(`[ProtocolFee] Burn fee collection failed: ${(error instanceof Error ? error.message : String(error))}`);
        }
    }
    /**
     * Return total fees collected so far.
     */
    async getCollectedFees() {
        return this.totalCollected;
    }
    /**
     * EIP-712 signature verification (x402 compliance).
     */
    async verifySignature(feeCalc, signature, user, nonce, deadline) {
        // B1-2 + P1-2: Replay protection via pluggable cache
        if (await this.replayCache.has(signature)) {
            throw new Error("Signature already used (replay protection)");
        }
        // B1-2: Deadline check
        const now = Math.floor(Date.now() / 1000);
        if (deadline < now) {
            throw new Error("Signature deadline expired");
        }
        const normalizedUser = ethers_1.ethers.getAddress(user);
        const domain = {
            name: "OpenTTT_ProtocolFee",
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
            token: ethers_1.ethers.getAddress(feeCalc.feeTokenAddress),
            amount: feeCalc.protocolFeeUsd,
            nonce: nonce,
            deadline: deadline
        };
        try {
            const recoveredAddress = ethers_1.ethers.verifyTypedData(domain, types, value, signature);
            if (ethers_1.ethers.getAddress(recoveredAddress) !== normalizedUser) {
                throw new Error("Invalid EIP-712 signature: signer mismatch");
            }
            await this.replayCache.set(signature, 3600000); // Mark as used with 1h TTL
        }
        catch (error) {
            throw new Error(`[ProtocolFee] Signature verification failed: ${(error instanceof Error ? error.message : String(error))}`);
        }
    }
}
exports.ProtocolFeeCollector = ProtocolFeeCollector;

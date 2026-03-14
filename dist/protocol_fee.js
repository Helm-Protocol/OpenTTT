"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolFeeCollector = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("./logger");
/**
 * ProtocolFeeCollector - Helm 프로토콜 수수료 수취 및 검증 담당
 * x402 컴플라이언스를 위해 EIP-712 서명 검증을 포함
 */
class ProtocolFeeCollector {
    totalCollected = 0n;
    chainId;
    verifyingContract;
    // P1-2 FIX: Bounded LRU replay cache (max 10K entries, 1h TTL) instead of unbounded Set
    usedSignatures = new Map();
    MAX_REPLAY_CACHE = 10000;
    REPLAY_TTL_MS = 3600000; // 1 hour
    evmConnector;
    protocolFeeRecipient;
    feeContract = null;
    constructor(chainId, verifyingContract, evmConnector, protocolFeeRecipient) {
        // R3-P0-2: Validate chainId is a positive integer to prevent cross-chain replay
        if (!Number.isInteger(chainId) || chainId <= 0) {
            throw new Error(`[ProtocolFee] Invalid chainId: ${chainId}. Must be a positive integer.`);
        }
        this.chainId = chainId;
        this.verifyingContract = ethers_1.ethers.getAddress(verifyingContract);
        this.evmConnector = evmConnector;
        this.protocolFeeRecipient = ethers_1.ethers.getAddress(protocolFeeRecipient);
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
     * 민팅 수수료 수취 (Stablecoin)
     * @param feeCalc - DynamicFeeEngine에서 계산된 수수료 정보
     * @param signature - EIP-712 서명 (필수, x402 검증용)
     * @param user - 서명자 주소
     * @param nonce - 중복 방지 nonce
     * @param deadline - 서명 유효 기한
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
     * 소각 수수료 수취
     * @param feeCalc - DynamicFeeEngine에서 계산된 수수료 정보
     * @param signature - EIP-712 서명 (필수)
     * @param user - 서명자 주소
     * @param nonce - 중복 방지 nonce
     * @param deadline - 서명 유효 기한
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
     * 현재까지 수취한 총 수수료 반환
     */
    async getCollectedFees() {
        return this.totalCollected;
    }
    /**
     * P1-2: Prune expired signatures from replay cache
     */
    lastPruneTime = 0;
    static PRUNE_INTERVAL_MS = 60000; // R3-P1-5: Prune at most once per minute
    pruneExpiredSignatures() {
        const now = Date.now();
        // R3-P1-5: Only prune periodically, not on every call — prevents O(n) DoS
        if (now - this.lastPruneTime < ProtocolFeeCollector.PRUNE_INTERVAL_MS &&
            this.usedSignatures.size <= this.MAX_REPLAY_CACHE) {
            return;
        }
        this.lastPruneTime = now;
        for (const [sig, ts] of this.usedSignatures) {
            if (now - ts > this.REPLAY_TTL_MS) {
                this.usedSignatures.delete(sig);
            }
        }
        // If still over limit, remove oldest entries
        if (this.usedSignatures.size > this.MAX_REPLAY_CACHE) {
            const entries = [...this.usedSignatures.entries()].sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, entries.length - this.MAX_REPLAY_CACHE);
            for (const [sig] of toRemove) {
                this.usedSignatures.delete(sig);
            }
        }
    }
    /**
     * EIP-712 서명 검증 (x402 compliance)
     */
    async verifySignature(feeCalc, signature, user, nonce, deadline) {
        // B1-2 + P1-2: Bounded replay protection with TTL
        this.pruneExpiredSignatures();
        if (this.usedSignatures.has(signature)) {
            throw new Error("Signature already used (replay protection)");
        }
        // B1-2: Deadline check
        const now = Math.floor(Date.now() / 1000);
        if (deadline < now) {
            throw new Error("Signature deadline expired");
        }
        const normalizedUser = ethers_1.ethers.getAddress(user);
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
            this.usedSignatures.set(signature, Date.now()); // Mark as used with timestamp
        }
        catch (error) {
            throw new Error(`[ProtocolFee] Signature verification failed: ${(error instanceof Error ? error.message : String(error))}`);
        }
    }
}
exports.ProtocolFeeCollector = ProtocolFeeCollector;

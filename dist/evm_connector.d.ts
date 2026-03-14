import { JsonRpcProvider, Signer, TransactionReceipt } from "ethers";
import { TTTRecord } from "./adaptive_switch";
export interface VerificationResult {
    valid: boolean;
    blockNumber: number;
    timestamp: number;
    txCount: number;
    latency: number;
}
export declare class EVMConnector {
    private provider;
    private signer;
    private tttContract;
    private protocolFeeContract;
    private eventListeners;
    private static readonly GAS_TIMEOUT_MS;
    constructor();
    /**
     * P1-7: Race estimateGas against timeout to prevent DoS
     */
    private withTimeout;
    /**
     * Connect to an EVM chain using either a private key or a pre-configured signer.
     */
    connect(rpcUrl: string, signerOrKey: string | Signer): Promise<void>;
    /**
     * Attach the TTT Token contract.
     */
    attachContract(address: string, abi: any[]): void;
    /**
     * Attach the ProtocolFee contract.
     */
    attachProtocolFeeContract(address: string, abi: any[]): void;
    /**
     * Generic TTT Record Submission (Burn)
     */
    submitTTTRecord(record: TTTRecord, amount: bigint, tier: number): Promise<TransactionReceipt>;
    /**
     * Mint TTT (Owner only)
     */
    mintTTT(to: string, amount: bigint, grgHash: string, potHash?: string): Promise<TransactionReceipt>;
    /**
     * Burn TTT (Simple wrapper)
     */
    burnTTT(amount: bigint, grgHash: string, tierLevel: number): Promise<{
        hash: string;
    }>;
    /**
     * Get TTT Balance (ERC-1155)
     */
    getTTTBalance(user: string, tokenId: bigint): Promise<bigint>;
    /**
     * Swap tokens on a DEX (Uniswap V4 Simulation)
     */
    swap(routerAddress: string, tokenIn: string, tokenOut: string, amountIn: bigint, minAmountOut: bigint): Promise<TransactionReceipt>;
    /**
     * Subscribe to TTT and Fee events.
     */
    subscribeToEvents(callbacks: {
        onMinted?: (to: string, tokenId: bigint, amount: bigint) => void;
        onBurned?: (from: string, tokenId: bigint, amount: bigint, tier: bigint) => void;
        onFeeCollected?: (payer: string, amount: bigint, nonce: bigint) => void;
    }): Promise<void>;
    /**
     * P2-6: Unsubscribe all event listeners to prevent memory leaks.
     */
    unsubscribeAll(): void;
    /**
     * Verify Block Data
     */
    verifyBlock(blockNum: number): Promise<VerificationResult>;
    /**
     * Get pending transactions for the current provider.
     */
    getPendingTransactions(): Promise<string[]>;
    /**
     * Get the provider instance.
     */
    getProvider(): JsonRpcProvider;
    /**
     * Get the signer instance.
     */
    getSigner(): Signer;
    /**
     * Extract human-readable revert reason from ethers error.
     */
    private extractRevertReason;
}

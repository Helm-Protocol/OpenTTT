import { EVMConnector } from "./evm_connector";
import { BeforeSwapParams, AfterSwapParams } from "./types";
/**
 * UniswapV4Hook - TTT-based Uniswap V4 Hook Simulation
 * Provides actual logic for TTT balance verification and fee management.
 */
export declare class UniswapV4Hook {
    private evmConnector;
    private hookAddress;
    private tttTokenAddress;
    private minTTTBalance;
    private swapFeeTTT;
    private tttContract;
    private stats;
    constructor(evmConnector: EVMConnector, hookAddress: string, tttTokenAddress: string, minTTTBalance?: bigint, swapFeeTTT?: bigint);
    /**
     * beforeSwap(params: BeforeSwapParams): Promise<void>
     * Check TTT balance and deduct fees before a swap.
     */
    beforeSwap(params: BeforeSwapParams): Promise<void>;
    /**
     * afterSwap(params: AfterSwapParams): Promise<void>
     * Record results and update statistics after a swap.
     */
    afterSwap(params: AfterSwapParams): Promise<void>;
    /**
     * getHookAddress(): string
     * Return the hook contract address.
     */
    getHookAddress(): string;
    /**
     * Return current statistics for the hook.
     */
    getStats(): {
        totalSwaps: number;
        totalFeesCollected: string;
        lastSwapTimestamp: number;
        failedBurns: number;
    };
}

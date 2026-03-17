import { EVMConnector } from "./evm_connector";
import { ProtocolFeeCollector } from "./protocol_fee";
import { FeeCalculation } from "./dynamic_fee";
import { BeforeSwapParams, AfterSwapParams } from "./types";
/**
 * UniswapV4Hook - TTT-based Uniswap V4 Hook Simulation (SDK-side)
 *
 * This is a simulation/SDK-side hook that mirrors the logic of a Uniswap V4 hook
 * for off-chain validation and testing. It is NOT the actual Solidity on-chain hook.
 *
 * The actual V4 hook contract should implement IHooks from @uniswap/v4-core
 * (see: https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IHooks.sol).
 *
 * Provides TTT balance verification and fee management logic that can be used
 * to validate swap eligibility before submitting on-chain transactions.
 */
export declare class UniswapV4Hook {
    private evmConnector;
    private hookAddress;
    private tttTokenAddress;
    private minTTTBalance;
    private swapFeeTTT;
    private tttContract;
    private feeCollector?;
    private stats;
    constructor(evmConnector: EVMConnector, hookAddress: string, tttTokenAddress: string, minTTTBalance?: bigint, swapFeeTTT?: bigint, feeCollector?: ProtocolFeeCollector);
    /**
     * beforeSwap(params: BeforeSwapParams): Promise<void>
     * Check TTT balance and deduct fees before a swap.
     */
    beforeSwap(params: BeforeSwapParams): Promise<void>;
    /**
     * afterSwap(params: AfterSwapParams): Promise<void>
     * Record results and update statistics after a swap.
     */
    afterSwap(params: AfterSwapParams, burnFeeCalc?: FeeCalculation, signature?: string, nonce?: bigint, deadline?: number): Promise<void>;
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

import { AdaptiveMode } from "./adaptive_switch";
import { EVMConnector } from "./evm_connector";
import { ProtocolFeeCollector } from "./protocol_fee";
import { DynamicFeeEngine, FeeCalculation } from "./dynamic_fee";
export interface SwapDetails {
    user: string;
    tokenIn: string;
    tokenOut: string;
    amount: bigint;
}
export declare class X402Enforcer {
    private static getCost;
    /**
     * Deducts TTT ticks from the provided balance and determines Adaptive Mode.
     *
     * **Important:** By default, the `balance` parameter is an SDK-local value
     * (tracked in-memory by the caller). It is NOT verified against the on-chain
     * TTT token balance. This is sufficient for hot-path tick accounting where
     * on-chain settlement happens separately via `deductOnChain()`.
     *
     * @param feeEngine - Dynamic fee engine for cost calculation
     * @param swap - Swap details (user, tokens, amount)
     * @param balance - SDK-local TTT balance (not on-chain unless verifyOnChain=true)
     * @param tier - Stratum tier (0-3)
     * @param mode - Current adaptive mode (Turbo/Full)
     * @param verifyOnChain - If true, checks on-chain TTT balance via EVMConnector
     *   before deducting. Requires `connector` and `tokenId`. Default: false.
     * @param connector - EVMConnector instance (required when verifyOnChain=true)
     * @param tokenId - Token ID for on-chain balance lookup (required when verifyOnChain=true)
     */
    static deductTick(feeEngine: DynamicFeeEngine, swap: SwapDetails, balance: bigint, tier: number, mode: AdaptiveMode, verifyOnChain?: boolean, connector?: EVMConnector, tokenId?: bigint): Promise<{
        success: boolean;
        remaining: bigint;
        mode: AdaptiveMode;
    }>;
    /**
     * Executes on-chain TTT burn via EVMConnector.
     */
    static deductOnChain(connector: EVMConnector, feeEngine: DynamicFeeEngine, swap: SwapDetails, grgHash: string, tier: number, feeCollector?: ProtocolFeeCollector, burnFeeCalc?: FeeCalculation, signature?: string, nonce?: bigint, deadline?: number): Promise<string>;
    /**
     * Static validation rule.
     */
    static enforcePool(feeEngine: DynamicFeeEngine, swap: SwapDetails, tttBalance: bigint, tier: number): Promise<boolean>;
}

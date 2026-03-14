import { AdaptiveMode } from "./adaptive_switch";
import { EVMConnector } from "./evm_connector";
import { DynamicFeeEngine } from "./dynamic_fee";
export interface SwapDetails {
    user: string;
    tokenIn: string;
    tokenOut: string;
    amount: bigint;
}
export declare class X402Enforcer {
    private static getCost;
    /**
     * Deducts TTT ticks from local balance and determines Adaptive Mode.
     */
    static deductTick(feeEngine: DynamicFeeEngine, swap: SwapDetails, balance: bigint, tier: number, mode: AdaptiveMode): Promise<{
        success: boolean;
        remaining: bigint;
        mode: AdaptiveMode;
    }>;
    /**
     * Executes on-chain TTT burn via EVMConnector.
     */
    static deductOnChain(connector: EVMConnector, feeEngine: DynamicFeeEngine, swap: SwapDetails, grgHash: string, tier: number): Promise<string>;
    /**
     * Static validation rule.
     */
    static enforcePool(feeEngine: DynamicFeeEngine, swap: SwapDetails, tttBalance: bigint, tier: number): Promise<boolean>;
}

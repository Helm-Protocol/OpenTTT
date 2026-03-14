import { AdaptiveMode, Block, TTTRecord } from "./adaptive_switch";
import { EVMConnector } from "./evm_connector";
export declare class TTTBuilder {
    private mode;
    private connector;
    private tttBalance;
    private adaptiveSwitch;
    constructor(connector?: EVMConnector);
    /**
     * Purchase TTT from the market using EVMConnector.
     * P1-5: Router/token addresses configurable. P1-6: 5% slippage protection.
     */
    purchaseTTT(poolAddress: string, amount: bigint, tokenInAddress?: string, routerAddress?: string, slippageBps?: bigint): Promise<void>;
    /**
     * Apply TTT to a block by burning it.
     * This signals the intention to use TTT for prioritized processing.
     */
    consumeTick(tokenId: string, tier?: string): Promise<void>;
    /**
     * Verify block data using the AdaptiveSwitch pipeline.
     * Updates the current mode based on verification results.
     */
    verifyBlock(blockData: Block, tttRecord: TTTRecord): Promise<AdaptiveMode>;
    /**
     * Return the current TURBO/FULL mode.
     */
    getMode(): AdaptiveMode;
    /**
     * Helper to get current balance (for testing).
     */
    getBalance(): bigint;
}

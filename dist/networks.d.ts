/**
 * Network configuration for TTT SDK
 */
export interface NetworkConfig {
    chainId: number;
    rpcUrl: string;
    tttAddress: string;
    protocolFeeAddress: string;
    usdcAddress: string;
}
/**
 * Base Mainnet network preset.
 *
 * `tttAddress` and `protocolFeeAddress` are set to the zero address because the
 * TTT contracts have not yet been deployed to Base Mainnet. These are
 * placeholders only — using them without an override will cause a runtime error
 * (validated in `TTTClient.create`).
 *
 * **Operators deploying to mainnet** must supply their own `contractAddress` and
 * `feeCollectorAddress` via `TTTClientConfig` when calling `TTTClient.create()`.
 * Example:
 * ```ts
 * const client = await TTTClient.create({
 *   network: "base",
 *   contractAddress: "0xYourDeployedTTTContract",
 *   feeCollectorAddress: "0xYourFeeCollector",
 *   // ...other config
 * });
 * ```
 */
export declare const BASE_MAINNET: NetworkConfig;
export declare const ETH_SEPOLIA: NetworkConfig;
export declare const BASE_SEPOLIA: NetworkConfig;
export declare const NETWORKS: Record<string, NetworkConfig>;

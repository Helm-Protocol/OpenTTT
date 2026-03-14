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
export declare const BASE_MAINNET: NetworkConfig;
export declare const BASE_SEPOLIA: NetworkConfig;
export declare const NETWORKS: Record<string, NetworkConfig>;

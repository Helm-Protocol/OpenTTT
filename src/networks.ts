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
export const BASE_MAINNET: NetworkConfig = {
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
  tttAddress: "0x0000000000000000000000000000000000000000",
  protocolFeeAddress: "0x0000000000000000000000000000000000000000",
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export const ETH_SEPOLIA: NetworkConfig = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  tttAddress: "0x8C633b05b833a476925F7d9818da6E215760F2c7",
  protocolFeeAddress: "0x5DeB2888904c4f71879b8813352E903992ffECD3",
  usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export const BASE_SEPOLIA: NetworkConfig = {
  chainId: 84532,
  rpcUrl: "https://sepolia.base.org",
  tttAddress: "0x0000000000000000000000000000000000000000",
  protocolFeeAddress: "0x0000000000000000000000000000000000000000",
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const NETWORKS: Record<string, NetworkConfig> = {
  base: BASE_MAINNET,
  sepolia: ETH_SEPOLIA,
  baseSepolia: BASE_SEPOLIA,
};

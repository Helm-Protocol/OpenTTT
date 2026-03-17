"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORKS = exports.BASE_SEPOLIA = exports.ETH_SEPOLIA = exports.BASE_MAINNET = void 0;
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
exports.BASE_MAINNET = {
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    tttAddress: "0x0000000000000000000000000000000000000000",
    protocolFeeAddress: "0x0000000000000000000000000000000000000000",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
exports.ETH_SEPOLIA = {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    tttAddress: "0x291b83F605F2dA95cf843d4a53983B413ef3B929",
    protocolFeeAddress: "0x6b39D96741BB4Ce6283F824CC31c2931c75AEe64",
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};
exports.BASE_SEPOLIA = {
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    tttAddress: "0xde357135cA493e59680182CDE9E1c6A4dA400811",
    protocolFeeAddress: "0xE289337d3a79b22753BDA03510a8b8E4D1040F21",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
exports.NETWORKS = {
    base: exports.BASE_MAINNET,
    sepolia: exports.ETH_SEPOLIA,
    baseSepolia: exports.BASE_SEPOLIA,
};

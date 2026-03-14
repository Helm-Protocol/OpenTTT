"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORKS = exports.BASE_SEPOLIA = exports.BASE_MAINNET = void 0;
// ⚠️ MAINNET ADDRESSES NOT YET DEPLOYED — must be overridden via TTTClientConfig.contractAddress
// Using these defaults without override will throw at runtime (validated in TTTClient.create)
exports.BASE_MAINNET = {
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    tttAddress: "0x0000000000000000000000000000000000000000",
    protocolFeeAddress: "0x0000000000000000000000000000000000000000",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
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
    sepolia: exports.BASE_SEPOLIA,
};

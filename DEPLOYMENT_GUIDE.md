# TTT SDK Deployment Guide

This guide covers the deployment of the TTT SDK and its associated smart contracts.

## 1. Prerequisites
- **Node.js**: v18 or higher
- **Ethereum Library**: `ethers.js` v6
- **Smart Contract Framework**: Hardhat
- **RPC Provider**: Alchemy, Infura, or a trusted Base Mainnet provider
- **Wallet**: An operator wallet funded with ETH (for gas on Base)

## 2. Smart Contract Deployment Sequence

### Step 1: Deploy TTT.sol (ERC-1155)
The core contract managing temporal "ticks".
1. Update `hardhat.config.ts` with Base Mainnet network settings.
2. Run deployment script:
   ```bash
   npx hardhat run scripts/deploy_ttt.ts --network base
   ```
3. Save the returned `TTT_ADDRESS`.

### Step 2: Deploy ProtocolFee.sol
Handles EIP-712 fee collection.
1. Run deployment script:
   ```bash
   npx hardhat run scripts/deploy_fee.ts --network base
   ```
2. Save the returned `PROTOCOL_FEE_ADDRESS`.

### Step 3: Verify Contracts
Verify on BaseScan for transparency and easier debugging:
```bash
npx hardhat verify --network base [TTT_ADDRESS]
npx hardhat verify --network base [PROTOCOL_FEE_ADDRESS]
```

## 3. SDK Configuration (`networks.ts`)

Once contracts are deployed, update `src/networks.ts` to include the new addresses in the `BASE_MAINNET` preset:

```typescript
export const BASE_MAINNET: NetworkConfig = {
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
  tttAddress: "[YOUR_DEPLOYED_TTT_ADDRESS]",
  protocolFeeAddress: "[YOUR_DEPLOYED_FEE_ADDRESS]",
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
};
```

## 4. Chainlink Price Feed Configuration
The TTT protocol dynamic fee engine requires a verified Chainlink USD price feed.
- Base Mainnet Feed: `0x...` (See [Chainlink Data Feeds](https://data.chain.link/base/mainnet/crypto-usd))
- Ensure the feed is active and has sufficient heartbeat.

## 5. Security Checklist
- **Private Keys**: Never commit your `privateKey` or `.env` files.
- **Fee Recipient**: Verify `protocolFeeRecipient` is a multisig or hardware wallet in production.
- **Gas**: Ensure the operator wallet has at least 0.1 ETH for sustained operations.

## 6. Monitoring & Alerts
Use `client.getHealth()` and `client.onAlert()` to hook into your existing monitoring infrastructure (Datadog, Grafana, etc.).
- **Events**: Monitor `TTTMinted` and `FeeCollected` events.
- **Thresholds**: Set `setMinBalance()` to be notified before the operator runs out of gas.

# Tikitaka Tick Token (TTT) SDK

Time-verified transaction ordering for EVM chains. TTT uses high-precision NTP time synthesis + GRG data integrity to create a physics-based MEV deterrent — honest builders get TURBO mode (fast, cheap), dishonest builders get FULL mode (slow, expensive).

## Installation

```bash
npm install @helm-protocol/ttt-sdk
```

## Quick Start — 3 Lines

```typescript
import { TTTClient } from '@helm-protocol/ttt-sdk';

// 1. Initialize for Base Mainnet (or forSepolia)
const client = await TTTClient.forBase({
  signer: { type: 'privateKey', envVar: 'OPERATOR_PK' }
});

// 2. Start the autonomous minting loop
client.startAutoMint();
```

## Signer Configuration (`SignerConfig`)

The SDK supports multiple signer types to balance security and ease of use:

| Type | Description | Configuration Fields |
|------|-------------|----------------------|
| `privateKey` | Standard Ethereum private key | `key?: string`, `envVar?: string` |
| `turnkey` | TEE-based institutional custody | `apiBaseUrl`, `organizationId`, `privateKeyId`, `apiPublicKey`, `apiPrivateKey` |
| `privy` | Embedded/Social wallets | `appId`, `appSecret`, `walletId?` |
| `kms` | Cloud HSM (AWS/GCP) | `provider: 'aws'\|'gcp'`, `keyId`, `region?` |

```typescript
// Example: Turnkey Configuration
const signer = {
  type: 'turnkey',
  organizationId: '...',
  privateKeyId: '...',
  // ... rest of config
};
```

## Network Presets

TTT SDK comes with built-in presets for the Base ecosystem:

```typescript
// Base Sepolia (Testnet)
const client = await TTTClient.forSepolia({ signer });

// Base Mainnet (Production)
const client = await TTTClient.forBase({ signer });

// Custom Network
const client = await TTTClient.create({
  signer,
  network: {
    chainId: 8453,
    rpcUrl: 'https://...',
    tttAddress: '0x...',
    protocolFeeAddress: '0x...',
    usdcAddress: '0x...'
  }
});
```

## Error Handling

The SDK provides descriptive errors extending `TTTBaseError`. Each error includes a `reason` and a suggested `fix`:

```typescript
import { TTTBaseError, TTTSignerError } from '@helm-protocol/ttt-sdk';

try {
  const client = await TTTClient.forBase({ signer });
} catch (e) {
  if (e instanceof TTTBaseError) {
    console.error(`Error: ${e.message}`);
    console.error(`Reason: ${e.reason}`);
    console.error(`Action: ${e.fix}`);
  }
}
```

## Builder Integration

Builders use the `TTTBuilder` to consume temporal ticks and gain priority:

```typescript
import { TTTBuilder, EVMConnector } from '@helm-protocol/ttt-sdk';

const connector = new EVMConnector();
await connector.connect(rpcUrl, signer);

const builder = new TTTBuilder(connector);
await builder.purchaseTTT(poolAddress, ethers.parseEther("10"));
await builder.consumeTick(tokenId, "T1_block");
```

## Architecture

```
TTTClient (entry point)
├── AutoMintEngine (periodic minting loop)
│   ├── TimeSynthesis (NTP multi-source median synthesis)
│   ├── DynamicFeeEngine (oracle-based pricing)
│   ├── EVMConnector (on-chain mint/burn/events)
│   └── ProtocolFeeCollector (EIP-712 signed fee collection)
├── AdaptiveSwitch (TURBO/FULL mode state machine)
├── GRG Pipeline (Golomb + Reed-Solomon + Golay error correction)
└── PoolRegistry (multi-pool statistics)
```

## Tier Reference

| Tier | Interval | Target Cost | Use Case |
|------|----------|-------------|----------|
| T0_epoch | 6.4 min | $0.001 | Batching / Standard Swap |
| T1_block | 2 sec | $0.01 | L2 Priority (Base) |
| T2_slot | 12 sec | $0.24 | L1 Priority (Ethereum) |
| T3_micro | 100 ms | $12.00 | High-frequency HFT |

## License

MIT

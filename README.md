# OpenTTT

> **Reference implementation of [draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)**

**OpenSSL for Transaction Ordering** -- TLS-grade Proof of Time for DeFi.

OpenTTT brings cryptographic time verification to blockchain transaction ordering. Where TLS made HTTP trustworthy, OpenTTT makes transaction sequencing verifiable. No trust assumptions. No gentleman's agreements. Physics.

[![npm](https://img.shields.io/npm/v/openttt)](https://www.npmjs.com/package/openttt)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml/badge.svg)](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Helm-Protocol/OpenTTT/branch/main/graph/badge.svg)](https://codecov.io/gh/Helm-Protocol/OpenTTT)
[![Tests](https://img.shields.io/badge/tests-365%20passing%20%C2%B7%2031%20suites-brightgreen)]()

```
npm install openttt
```

---

## Why OpenTTT

Current MEV protection relies on **trust**: builders promise fair ordering, protocols ask nicely, and everyone hopes for the best. Flashbots asks builders to behave. OpenTTT proves whether they did.

| | Flashbots | OpenTTT |
|---|---|---|
| **Mechanism** | Social contract (request) | Physical verification (proof) |
| **Enforcement** | Reputation, exclusion | Economic natural selection |
| **Bad actors** | Must be identified and removed | Naturally unprofitable, self-selecting out |
| **Time source** | Block timestamp (miner-controlled) | Multi-source NTP synthesis (NIST, Google, Apple) |

**The core insight**: Rollups generate precise timestamps and deliver them to builders with a receipt. The Adaptive GRG pipeline then verifies whether the builder respected that ordering:

- **Honest builder**: Sequence matches -> **Turbo mode** (50ms verification) -> faster -> more profitable
- **Dishonest builder**: Sequence mismatch -> **Full mode** (127ms verification) -> slower -> less profitable -> leaves

No governance vote. No slashing committee. Cheating is simply bad business.

---

## Quick Start

Three lines to start minting TimeTokens:

```typescript
import { TTTClient } from "openttt";

const ttt = await TTTClient.forBase({ privateKey: process.env.OPERATOR_PK! });
ttt.startAutoMint();
```

That is it. The SDK connects to Base Mainnet, synthesizes time from three atomic clock sources, and begins minting Proof-of-Time tokens at your configured tier interval.

> **Shorthand**: Pass `privateKey` directly as a string instead of the full `signer` config object. The verbose form `{ signer: { type: "privateKey", key: "0x..." } }` still works for when you need other signer types (Turnkey, KMS, Privy).

---

## Progressive Disclosure

OpenTTT is designed around progressive disclosure. Start simple, add control as you need it.

### Level 1 -- Just Works

```typescript
import { TTTClient } from "openttt";

const ttt = await TTTClient.forBase({ privateKey: process.env.OPERATOR_PK! });
ttt.startAutoMint();
```

### Level 2 -- Custom Network and Tier

```typescript
const ttt = await TTTClient.forSepolia({
  privateKey: process.env.OPERATOR_PK!,
  rpcUrl: "https://my-rpc.example.com",
  tier: "T2_slot",
});
ttt.startAutoMint();
```

### Level 3 -- Full Control

```typescript
const ttt = await TTTClient.create({
  signer: {
    type: "turnkey",
    apiBaseUrl: "https://api.turnkey.com",
    organizationId: "org-...",
    privateKeyId: "pk-...",
    apiPublicKey: "...",
    apiPrivateKey: "...",
  },
  network: "base",
  tier: "T1_block",
  contractAddress: "0x...",
  poolAddress: "0x...",
  timeSources: ["nist", "google", "cloudflare", "apple"],
  protocolFeeRate: 0.05,
  enableGracefulShutdown: true,
});

ttt.startAutoMint();
```

---

## Signer Options

OpenTTT abstracts away signer complexity. Use a raw private key for development, TEE-backed keys for production, or cloud HSMs for institutional deployments.

| Type | Use Case | Config |
|---|---|---|
| `privateKey` | Development, small operators | `{ type: "privateKey", key: "0x..." }` or `{ type: "privateKey", envVar: "OPERATOR_PK" }` |
| `turnkey` | Production, TEE-backed institutional custody | `{ type: "turnkey", apiBaseUrl, organizationId, privateKeyId, apiPublicKey, apiPrivateKey }` |
| `privy` | Embedded wallets, consumer-facing apps (coming soon) | `{ type: "privy", appId, appSecret }` |
| `kms` | Cloud HSM (AWS KMS or GCP Cloud KMS) | `{ type: "kms", provider: "aws"\|"gcp", keyId, ... }` |

**AWS KMS** requires `@aws-sdk/client-kms`. **GCP KMS** requires `@google-cloud/kms`. Both are optional peer dependencies -- install only what you use.

---

## Tiers

Tiers control the minting interval. Choose based on your protocol's ordering resolution requirements.

| Tier | Interval | Use Case |
|---|---|---|
| `T0_epoch` | 6.4 minutes | Epoch-level ordering (validator sets, beacon chain) |
| `T1_block` | 2 seconds | Block-level ordering on Base L2 **(default)** |
| `T2_slot` | 12 seconds | Slot-level ordering on Ethereum L1 |
| `T3_micro` | 100 milliseconds | High-frequency ordering (IoT, sub-block) |

```typescript
const ttt = await TTTClient.forBase({
  signer: { type: "privateKey", envVar: "OPERATOR_PK" },
  tier: "T2_slot",
});
```

---

## Health Monitoring

Production deployments need observability. `getHealth()` returns a comprehensive status object covering connectivity, balance, and mint performance.

```typescript
const health = await ttt.getHealth();

console.log(health);
// {
//   healthy: true,
//   checks: {
//     initialized: true,
//     rpcConnected: true,
//     signerAvailable: true,
//     balanceSufficient: true,
//     ntpSourcesOk: true
//   },
//   metrics: {
//     mintCount: 142,
//     mintFailures: 0,
//     successRate: 1.0,
//     totalFeesPaid: "71000000000000",
//     avgMintLatencyMs: 1847,
//     lastMintAt: "2026-03-14T10:30:00.000Z",
//     uptimeMs: 86400000
//   },
//   alerts: []
// }
```

**Alerts** are emitted automatically when:
- RPC connection is lost
- ETH balance drops below threshold (default: 0.01 ETH)
- Mint success rate falls below 80%

Register a callback for real-time alerting:

```typescript
ttt.onAlert((alert) => {
  // Send to PagerDuty, Slack, Telegram, etc.
  console.error(`[OpenTTT Alert] ${alert}`);
});

ttt.setMinBalance(ethers.parseEther("0.05")); // Custom threshold
```

---

## Networks

| Network | Chain ID | Factory Method |
|---|---|---|
| Base Mainnet | 8453 | `TTTClient.forBase(config)` |
| Base Sepolia | 84532 | `TTTClient.forSepolia(config)` |

Custom networks can be provided via the `network` field in `TTTClient.create()`:

```typescript
const ttt = await TTTClient.create({
  signer: { type: "privateKey", envVar: "OPERATOR_PK" },
  network: {
    chainId: 8453,
    rpcUrl: "https://my-custom-rpc.example.com",
    tttAddress: "0x...",
    protocolFeeAddress: "0x...",
    usdcAddress: "0x...",
  },
});
```

---

## API Reference

### TTTClient

| Method | Description |
|---|---|
| `TTTClient.create(config)` | Create and initialize a client with full configuration |
| `TTTClient.forBase(config)` | Factory for Base Mainnet (chain ID 8453) |
| `TTTClient.forSepolia(config)` | Factory for Base Sepolia testnet (chain ID 84532) |
| `ttt.startAutoMint()` | Start automatic TimeToken minting at the configured tier interval |
| `ttt.stopAutoMint()` | Stop the auto-mint loop |
| `ttt.getHealth()` | Returns `HealthStatus` with connectivity, balance, and performance checks |
| `ttt.getStatus()` | Returns current tier, mint count, fees paid, and token balances |
| `ttt.listPools()` | List all registered pool addresses |
| `ttt.getPoolStats(address)` | Get mint/burn statistics for a specific pool |
| `ttt.onAlert(callback)` | Register a callback for health alerts |
| `ttt.setMinBalance(wei)` | Set minimum ETH balance threshold for alerts |
| `ttt.destroy()` | Gracefully shut down: stops minting, unsubscribes events, clears state |

### TimeSynthesis

| Method | Description |
|---|---|
| `synthesize()` | Query all configured NTP sources and return a median-synthesized timestamp |
| `generateProofOfTime()` | Generate a verifiable Proof of Time with source signatures |
| `verifyProofOfTime(pot)` | Verify that all source readings are within tolerance of the median |
| `TimeSynthesis.getOnChainHash(pot)` | Keccak256 hash of a PoT for on-chain submission |
| `TimeSynthesis.serializeToBinary(pot)` | Compact binary serialization for network transport |
| `TimeSynthesis.deserializeFromBinary(buf)` | Deserialize from binary format |

### GrgPipeline

| Method | Description |
|---|---|
| `GrgPipeline.processForward(data)` | Encode: Golomb compression -> Reed-Solomon erasure coding -> Golay verification |
| `GrgPipeline.processInverse(shards, length)` | Decode: Golay verify -> Reed-Solomon reconstruct -> Golomb decompress |

### AdaptiveSwitch

| Method | Description |
|---|---|
| `verifyBlock(block, tttRecord)` | Verify block ordering against TTT record; returns `TURBO` or `FULL` mode |
| `getCurrentMode()` | Current adaptive mode |
| `getFeeDiscount()` | Fee discount for current mode (20% in TURBO, 0% in FULL) |

---

## Architecture

```
TTTClient (entry point)
|-- AutoMintEngine         Periodic minting loop
|   |-- TimeSynthesis      NTP multi-source median synthesis (NIST, Google, Apple)
|   |-- DynamicFeeEngine   Oracle-based pricing
|   |-- EVMConnector       On-chain mint/burn/events (ethers v6)
|   '-- ProtocolFee        EIP-712 signed fee collection
|-- AdaptiveSwitch         TURBO/FULL mode state machine
|-- GRG Pipeline           Golomb + Reed-Solomon + Golay error correction
|-- PoolRegistry           Multi-pool statistics tracking
'-- Signer Abstraction     PrivateKey | Turnkey | Privy | KMS
```

### The GRG Pipeline

GRG (Golomb-Reed-Golay) is the data integrity backbone of OpenTTT, analogous to how the TLS record protocol protects HTTP payloads.

```
              FORWARD (Encode)
  Raw Data --> Golomb-Rice Compression
           --> Reed-Solomon Erasure Coding
           --> Golay(24,12) Verification Codes
           --> Shards

              INVERSE (Decode)
  Shards   --> Golay(24,12) Error Detection
           --> Reed-Solomon Reconstruction
           --> Golomb-Rice Decompression
           --> Raw Data
```

**Golomb-Rice** compresses timestamp deltas efficiently (small integers compress well).
**Reed-Solomon** adds erasure coding so data survives shard loss.
**Golay(24,12)** detects and corrects up to 3-bit errors per 24-bit codeword.

### Adaptive Mode Switching

The economic enforcement mechanism uses a sliding window (20 blocks) with hysteresis:

- **Entry to Turbo**: 95% ordering match rate over 20+ blocks
- **Maintain Turbo**: 85% match rate (relaxed to prevent flapping)
- **Integrity failure in Turbo**: Exponential backoff penalty (20, 40, 80, 160, 320 blocks)

This asymmetry is deliberate: it is hard to earn trust and easy to lose it.

### Time Synthesis

OpenTTT queries multiple atomic clock-synchronized NTP sources in parallel and produces a median-synthesized timestamp with confidence scoring:

- **NIST** (time.nist.gov) -- US national standard
- **Apple** (time.apple.com) -- Apple global time service
- **Google** (time.google.com) -- Leap-smeared public NTP

All readings must fall within a stratum-dependent tolerance of the synthesized median (10ms for stratum 1, 25ms for stratum 2, 50ms for stratum 3+), or the Proof of Time is rejected. Single-source operation triggers a degraded-confidence warning.

---

## Error Handling

All SDK errors extend `TTTBaseError` and include three fields for actionable diagnostics:

```typescript
import { TTTSignerError } from "openttt";

try {
  const ttt = await TTTClient.forBase({
    signer: { type: "privateKey", envVar: "MISSING_VAR" },
  });
} catch (e) {
  if (e instanceof TTTSignerError) {
    console.error(e.message);  // What happened
    console.error(e.reason);   // Why it happened
    console.error(e.fix);      // How to fix it
  }
}
```

| Error Class | Scope |
|---|---|
| `TTTConfigError` | SDK or engine configuration |
| `TTTSignerError` | Signer acquisition or usage |
| `TTTNetworkError` | RPC, chain ID, connectivity |
| `TTTContractError` | Smart contract interaction |
| `TTTTimeSynthesisError` | NTP time synthesis failures |
| `TTTFeeError` | Dynamic fee or protocol fee collection |

---

## Graceful Shutdown

For long-running services, enable graceful shutdown to cleanly stop minting and release resources on SIGINT:

```typescript
const ttt = await TTTClient.create({
  signer: { type: "privateKey", envVar: "OPERATOR_PK" },
  network: "base",
  enableGracefulShutdown: true,
});
ttt.startAutoMint();

// Or shut down manually at any time:
await ttt.destroy();
```

---

## Requirements

- Node.js >= 18
- TypeScript >= 5.3 (for development)
- Network access to NTP servers (UDP port 123 outbound)

**Optional peer dependencies** (install only what you use):

| Package | Required for |
|---|---|
| `@aws-sdk/client-kms` | AWS KMS signer |
| `@google-cloud/kms` | GCP Cloud KMS signer |

---

## License

[Business Source License 1.1](LICENSE)

Copyright 2026 Helm Protocol.

---

## Learn More

- [IETF Draft: draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) — TTTPS Protocol Specification
- [Yellow Paper](https://github.com/Helm-Protocol/OpenTTT/blob/main/YELLOW_PAPER.md) — Technical Deep Dive
- [MCP Server](https://github.com/Helm-Protocol/OpenTTT/tree/main/mcp) — AI Agent Integration (`@helm-protocol/ttt-mcp`)
- [Subgraph (The Graph)](https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0) — On-chain PoT Data
- [Base Sepolia Contracts](https://sepolia.basescan.org/address/0xde357135cA493e59680182CDE9E1c6A4dA400811) — TTT ERC-1155
- [Helm Protocol](https://github.com/Helm-Protocol) — GitHub Organization

[GitHub](https://github.com/Helm-Protocol/OpenTTT) | Built by [Helm Protocol](https://github.com/Helm-Protocol)

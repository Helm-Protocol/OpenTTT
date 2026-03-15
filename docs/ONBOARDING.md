# OpenTTT Client Onboarding Guide

> **Target audience**: DEX operators and block builders integrating TTT into their transaction ordering pipeline.
> **Time to first mint**: < 5 minutes on Sepolia testnet.

---

## Prerequisites

Before you start:

- [ ] Node.js >= 18 installed
- [ ] A private key for your operator wallet (or Turnkey/KMS credentials)
- [ ] Sepolia ETH from a faucet (for testing) — [Google Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy Faucet](https://sepoliafaucet.com)
- [ ] Outbound UDP port 123 open (NTP time synthesis requires this)

---

## Quick Start (5 Steps)

### Step 1 — Install (30 seconds)

```bash
npm install openttt
```

One command. No global CLI, no additional tools.

### Step 2 — Configure & Connect (2 minutes)

**Minimal (recommended for first run):**

```typescript
import { TTTClient } from "openttt";

const ttt = await TTTClient.forSepolia({
  privateKey: process.env.OPERATOR_PK!,
});
```

**Full control:**

```typescript
const ttt = await TTTClient.create({
  signer: { type: "privateKey", key: process.env.OPERATOR_PK! },
  network: "sepolia",
  tier: "T1_block",
  poolAddress: "0xYourDEXPool",
  protocolFeeRate: 0.05,
  protocolFeeRecipient: "0xYourFeeWallet",
});
```

### Step 3 — First GRG Verification (1 minute)

Verify your connectivity before committing to on-chain operations:

```typescript
const health = await ttt.getHealth();
console.log(health.checks);
// { initialized: true, rpcConnected: true, signerAvailable: true, ntpSourcesOk: true }
```

### Step 4 — AdaptiveSwitch (the "aha" moment)

This is where OpenTTT differentiates. Watch TURBO/FULL mode switching live:

```typescript
import { AdaptiveSwitch } from "openttt";

const switcher = new AdaptiveSwitch();

// Honest blocks -> TURBO mode -> faster verification -> more profitable
ttt.on("mint", (result) => {
  console.log(`Mode: ${result.mode} | Token: ${result.tokenId}`);
  // After ~25 honest blocks: "Mode: TURBO | Token: 42"
});
```

- **TURBO mode** (50ms verification): Honest builder, sequence matches. 20% fee discount.
- **FULL mode** (127ms verification): Sequence mismatch detected. Full GRG pipeline.

### Step 5 — Protocol Fee & Auto-Mint (2 minutes)

```typescript
ttt.on("mint", (result) => {
  console.log(`Minted! Token: ${result.tokenId} | Fee: ${result.protocolFeePaid}`);
});

ttt.on("error", (err) => {
  console.error(`${err.message}`);
  console.error(`Fix: ${err.fix}`); // Actionable fix suggestion
});

ttt.startAutoMint();
```

---

## Error Message UX

All OpenTTT errors follow the **3-part pattern**:

```
TTTBaseError {
  message: "What happened"       — human-readable summary
  reason:  "Why it happened"     — technical cause
  fix:     "How to fix it"       — actionable next step
}
```

### Error Hierarchy

| Error Class | When | Example Fix |
|---|---|---|
| `TTTConfigError` | Bad SDK/engine configuration | `"protocolFeeRate must be 0-1 (got 1.5). Example: 0.05 = 5%"` |
| `TTTSignerError` | Key/signer issues | `"Private key must be 0x + 64 hex characters"` |
| `TTTNetworkError` | RPC/chain connectivity | `"RPC did not respond within 5000ms. Check your provider status."` |
| `TTTContractError` | Smart contract interaction | `"Ensure operator has minter role and sufficient gas."` |
| `TTTTimeSynthesisError` | NTP/time source issues | `"Open UDP port 123 for NTP. At least 2 sources required."` |
| `TTTFeeError` | Fee engine/collection | `"Check USDC approval and balance."` |

### Common Errors During Onboarding

| Error | Cause | Fix |
|---|---|---|
| `"Invalid RPC URL"` | Empty or malformed URL | Use a known RPC: `"https://sepolia.base.org"` |
| `"Invalid Private Key format"` | Missing `0x` prefix or wrong length | Must be `0x` + 64 hex characters (32 bytes) |
| `"Contract not attached"` | Called mint/burn before `attachContract()` | Use `TTTClient.create()` which handles attachment automatically |
| `"Operation timed out"` | RPC unresponsive | Check provider status. EVMConnector supports `fallbackRpcUrls` for redundancy |
| `"integrity check failed"` | Time synthesis returned low confidence | Ensure NTP port 123 is open. Need ≥ 2 atomic clock sources |

---

## Progressive Disclosure

OpenTTT is designed in three tiers of complexity:

### Beginner — "Just Works"

```typescript
const ttt = await TTTClient.forSepolia({ privateKey: process.env.OPERATOR_PK! });
ttt.startAutoMint();
```

You need: one environment variable. Everything else is defaulted.

### Intermediate — Custom Config

```typescript
const ttt = await TTTClient.create({
  signer: { type: "privateKey", key: process.env.OPERATOR_PK! },
  network: "sepolia",
  tier: "T2_slot",
  poolAddress: "0xYourPool",
  protocolFeeRate: 0.05,
  protocolFeeRecipient: "0xYourWallet",
});

ttt.on("mint", (r) => console.log(`Token ${r.tokenId} minted`));
ttt.on("error", (e) => console.error(`${e.message}: ${e.fix}`));
ttt.startAutoMint();
```

### Advanced — Full Pipeline Access

```typescript
import {
  TTTClient,
  EVMConnector,
  TimeSynthesis,
  AdaptiveSwitch,
  GrgPipeline,
  DynamicFeeEngine,
  PotSigner,
} from "openttt";

// Build your own pipeline with individual components
const evm = new EVMConnector({
  fallbackRpcUrls: ["https://backup-rpc.example.com"],
  maxReconnectAttempts: 5,
});
await evm.connect("https://primary-rpc.example.com", process.env.OPERATOR_PK!);

const timeSynth = new TimeSynthesis(["nist", "google", "cloudflare", "apple"]);
const switcher = new AdaptiveSwitch({ tolerance: 200 });
const potSigner = PotSigner.createOrLoad("./keys/pot_signer.json");

// Full control over every step
const synthesis = await timeSynth.synthesize();
const proof = await timeSynth.generateProofOfTime(synthesis, potSigner);
// ... mint with custom logic
```

### Key Management Maturity Ladder

```
Day 1:   privateKey (dev/testing)         — "just works"
Day 7:   envVar reference                 — "don't hardcode keys"
Day 30:  Turnkey/TEE                      — "production custody"
Day 90:  AWS KMS / GCP Cloud KMS          — "institutional grade"
```

---

## Production Deployment Checklist

### Must-Have (Before Go-Live)

- [ ] **Switch from Sepolia to Base Mainnet** — `TTTClient.forBase()` or `network: "base"`
- [ ] **Use Turnkey or KMS signer** — never raw private key in production
- [ ] **Configure RPC failover** — `EVMConnector({ fallbackRpcUrls: [...] })`
- [ ] **Back up PotSigner key** — `potSigner.saveToFile("./keys/pot_signer.json")`
- [ ] **Verify NTP port 123 open** — firewall must allow outbound UDP/123
- [ ] **Set contractAddress and feeCollectorAddress** — Base Mainnet requires your own deployed contracts

### Should-Have (First Week)

- [ ] **Health monitoring** — poll `ttt.getHealth()` on interval, alert on failure
- [ ] **Alerting integration** — connect `ttt.on('error', ...)` to PagerDuty/Slack
- [ ] **TURBO/FULL ratio monitoring** — sustained FULL indicates ordering issues
- [ ] **Graceful shutdown** — `enableGracefulShutdown: true` in config
- [ ] **AdaptiveSwitch state persistence** — `switcher.serialize()` / `AdaptiveSwitch.deserialize()` across restarts

### Nice-to-Have (First Month)

- [ ] **Gas price monitoring** — track costs via `DynamicFeeEngine`
- [ ] **Event subscriptions** — `evm.subscribeToEvents({ onMinted, onBurned, onFeeCollected })`
- [ ] **Multi-pool support** — separate `AdaptiveSwitch` instance per pool
- [ ] **Log aggregation** — OpenTTT uses structured logging via `logger` module

---

## Network Configuration

| Network | Shorthand | Chain ID | Contracts |
|---|---|---|---|
| **Base Mainnet** | `TTTClient.forBase()` | 8453 | Must deploy your own |
| **Ethereum Sepolia** | `TTTClient.forSepolia()` | 11155111 | Pre-deployed (testnet) |
| **Base Sepolia** | `network: "baseSepolia"` | 84532 | Must deploy your own |

### Sepolia Testnet Contracts (Pre-Deployed)

```
TTT (ERC-1155 + MINTER_ROLE + PAUSER_ROLE):  0x291b83F605F2dA95cf843d4a53983B413ef3B929
ProtocolFee (ERC-20 USDC + EIP-712):          0x6b39D96741BB4Ce6283F824CC31c2931c75AEe64
USDC (Sepolia):                                0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

Basescan: [TTT](https://sepolia.basescan.org/address/0x291b83F605F2dA95cf843d4a53983B413ef3B929) | [ProtocolFee](https://sepolia.basescan.org/address/0x6b39D96741BB4Ce6283F824CC31c2931c75AEe64)

---

## Tier Reference

| Tier | Interval | Tolerance | Use Case |
|---|---|---|---|
| `T0_epoch` | 384,000ms (6.4 min) | 2000ms | Epoch-level monitoring |
| `T1_block` | 2,000ms (2 sec) | 200ms | Block-level ordering, Base L2 (recommended) |
| `T2_slot` | 12,000ms (12 sec) | 500ms | Slot-level verification, Ethereum |
| `T3_micro` | 100ms | 10ms | Micro-level precision, IoT/HFT |

---

## Competitive Advantage Summary

| Feature | Flashbots | MEV-Share | **OpenTTT** |
|---|---|---|---|
| Installation | Infrastructure config | Raw JSON-RPC | **`npm install openttt`** |
| Time to start | Hours (relay setup) | 30min | **5 minutes** |
| Builder incentive | Reputation | Tips | **TURBO mode (20% fee discount)** |
| Enforcement | Social (exclusion) | Economic | **Physical (timestamp proof)** |
| SDK quality | No SDK | Community wrappers | **Typed, progressive, structured errors** |

---

## Getting Help

- **Errors**: Every error includes a `fix` field with the next step
- **GitHub**: [Helm-Protocol/OpenTTT](https://github.com/Helm-Protocol/OpenTTT)
- **Discord**: [Helm Protocol](https://discord.com/channels/1480061606581895201/1480061607391526944)

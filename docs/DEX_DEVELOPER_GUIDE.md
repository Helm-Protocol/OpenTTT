# OpenTTT DEX Developer Guide — Uniswap V4 Testnet Pool

> **DRAFT** — Internal only. Will be published after Circle meeting.

> OpenTTT brings Proof-of-Time verification to Uniswap V4 via a custom hook.
> This guide gets you from zero to swapping on our Base Sepolia testnet pool.

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | v18+ ([download](https://nodejs.org/)) |
| **Base Sepolia ETH** | For gas. Faucet: <https://www.alchemy.com/faucets/base-sepolia> |
| **USDC (Base Sepolia)** | Circle faucet: <https://faucet.circle.com/> — select Base Sepolia |
| **Git** | To clone the repo |

---

## 2. Deployed Contracts

All contracts are live on **Base Sepolia** (chainId `84532`).

| Contract | Address |
|---|---|
| **TestTTT** (ERC-20) | `0x96B8DF1ED862e99b04d7478E5DF090B1Ef03Ec1D` |
| **USDC** (Circle testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| **PoolManager** (Uniswap V4) | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| **TTTHookSimple** | `0x8C633b05b833a476925F7d9818da6E215760F2c7` |

- **Pool fee**: 0.3% (3000)
- **Pool pair**: TestTTT / USDC
- **Hook**: TTTHookSimple — emits `SwapVerified` events with PoT data on every verified swap

Explorer: <https://sepolia.basescan.org/address/0x8C633b05b833a476925F7d9818da6E215760F2c7#events>

---

## 3. Quick Start

### 3.1 Clone and install

```bash
git clone https://github.com/Helm-Protocol/OpenTTT.git
cd OpenTTT/contracts
npm install
```

### 3.2 Configure environment

Create `contracts/.env`:

```env
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

> Your deployer wallet needs Base Sepolia ETH (gas), TestTTT, and USDC balances.

### 3.3 Run the swap bot

```bash
npx hardhat run scripts/swap_bot.ts --network baseSepolia
```

This will:
1. Load deployment info from `deployment_base_sepolia.json`
2. Approve TestTTT and USDC to the PoolHelper (first run only)
3. Execute periodic swaps on the V4 pool (default: every 30s, 10 swaps)
4. Call `TTTHookSimple.verifySwap()` after each swap
5. Log the verification mode (turbo/full), fee, and PoT hash

Sample output:

```
  ── Swap #1 ──────────────────────────────
  Direction: SELL TestTTT → USDC
  Swap tx:    0xabc...
  Verify tx:  0xdef...
  Mode:       turbo
  Fee:        1000
  PoT Hash:   0x123...
  Stats:      total=42 turbo=38 full=4
```

---

## 4. How Proof-of-Time (PoT) Verification Works

```
  Swap on V4 Pool
        │
        ▼
  TTTHookSimple.verifySwap()
        │
        ├─ Checks swap against PoT timestamp
        │
        ├─ Honest (sequence matches)  → TURBO mode (50ms, lower fee)
        │
        └─ Dishonest (sequence off)   → FULL mode (127ms, higher fee)
        │
        ▼
  SwapVerified event emitted
        │
        ▼
  Subgraph indexes event
```

**Key insight**: There is no slashing or governance vote. Dishonest ordering is simply more expensive and slower — builders naturally self-select out.

### SwapVerified Event

```solidity
event SwapVerified(
    address indexed sender,
    bytes32 indexed pool,
    address indexed hook,
    string mode,        // "turbo" or "full"
    uint256 feeAmount,
    bytes32 potHash
);
```

### On-chain stats

```solidity
function getStats() external view returns (
    uint256 totalSwaps,
    uint256 turboSwaps,
    uint256 fullSwaps
);
```

---

## 5. Subgraph Queries

The subgraph indexes all `SwapVerified` and `PoTAnchored` events on Base Sepolia.

### Recent swap verifications

```graphql
{
  swapVerifications(first: 10, orderBy: timestamp, orderDirection: desc) {
    id
    sender
    pool
    mode
    feeAmount
    potAnchor {
      grgHash
      potHash
    }
    timestamp
    txHash
  }
}
```

### Daily turbo ratio (builder honesty metric)

```graphql
{
  dailyStats_collection(first: 7, orderBy: date, orderDirection: desc) {
    date
    totalSwaps
    turboCount
    fullCount
    turboRatio
    totalFees
  }
}
```

### Hourly swap volume

```graphql
{
  hourlyStats_collection(first: 24, orderBy: hour, orderDirection: desc) {
    hour
    totalSwaps
    turboCount
    fullCount
  }
}
```

### PoT anchors

```graphql
{
  potAnchors(first: 5, orderBy: timestamp, orderDirection: desc) {
    stratum
    grgHash
    potHash
    timestamp
    txHash
  }
}
```

---

## 6. Integrating in Your Own Code

Minimal TypeScript example to verify a swap programmatically:

```typescript
import { ethers } from "ethers";

const HOOK_ADDRESS = "0x8C633b05b833a476925F7d9818da6E215760F2c7";
const HOOK_ABI = [
  "function verifySwap(address sender, bytes32 pool, int256 swapDelta) external",
  "function getStats() external view returns (uint256, uint256, uint256)",
  "event SwapVerified(address indexed sender, bytes32 indexed pool, address indexed hook, string mode, uint256 feeAmount, bytes32 potHash)",
];

const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const hook = new ethers.Contract(HOOK_ADDRESS, HOOK_ABI, signer);

// Listen for SwapVerified events
hook.on("SwapVerified", (sender, pool, hookAddr, mode, fee, potHash) => {
  console.log(`Swap verified: mode=${mode} fee=${fee} pot=${potHash}`);
});

// Check current stats
const [total, turbo, full] = await hook.getStats();
console.log(`Total: ${total}, Turbo: ${turbo}, Full: ${full}`);
```

---

## 7. Links

| Resource | URL |
|---|---|
| **npm** | <https://www.npmjs.com/package/openttt> |
| **GitHub** | <https://github.com/Helm-Protocol/OpenTTT> |
| **IETF Draft** | <https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/> |
| **Base Sepolia Explorer** | <https://sepolia.basescan.org/> |
| **Contract Events** | <https://sepolia.basescan.org/address/0x8C633b05b833a476925F7d9818da6E215760F2c7#events> |

---

## FAQ

**Q: Where do I get TestTTT tokens?**
A: TestTTT is minted via the deployment script (`setup_pool.ts`). For testnet access, reach out on Discord.

**Q: Can I use this on mainnet?**
A: Not yet. This is a testnet deployment for development and testing. Mainnet deployment will follow.

**Q: What is the difference between turbo and full mode?**
A: Turbo mode (~50ms verification) is for swaps where transaction ordering matches the PoT timestamp — meaning the builder was honest. Full mode (~127ms) kicks in when there is a sequence mismatch. The economic incentive is clear: honest builders get faster, cheaper execution.

**Q: How does this relate to `openttt` on npm?**
A: The npm package is the SDK for minting and verifying TimeTokens. The Uniswap V4 hook is the on-chain component that uses PoT data to verify swap ordering. They work together.

# TTT SDK Usage Guide

Welcome to the TTT (TLS TimeToken) SDK guide. This document provides everything you need to know to integrate the TTT protocol into your decentralized exchange (DEX), rollup, or MEV mitigation pipeline.

---

## 1. Quick Start

Get your TTT pipeline running and mint your first tokens in under 5 minutes.

**Installation:**
```bash
npm install @helm-protocol/ttt-sdk
```

**Initialization & Auto-Mint:**
```typescript
import { TTTClient, AutoMintConfig } from "@helm-protocol/ttt-sdk";

const config: AutoMintConfig = {
  rpcUrl: "https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
  privateKey: process.env.OPERATOR_PK,
  chainlinkFeed: "0xChainlinkFeedAddress",
  targetTier: "T1_block",
  amount: 1000n * (10n ** 18n),
  threshold: 100n * (10n ** 18n),
  feeRecipient: "0xYourChecksummedAddress"
};

async function main() {
  const client = new TTTClient();
  await client.initialize(config);
  
  // Starts the background loop that monitors balance and auto-mints
  client.startAutoMint();
  
  console.log("TTT SDK Initialized & Auto-Minting started!");
}

main();
```

---

## 2. Core API Reference

### TTTClient
The main entry point for managing the SDK lifecycle.
- `initialize(config: AutoMintConfig): Promise<void>`: Connects to the EVM and initializes all sub-engines.
- `startAutoMint(): void`: Begins the background daemon to maintain TTT tick balances.
- `stopAutoMint(): void`: Halts the background daemon gracefully.
- `getStatus(): string`: Returns current engine state and health metrics.

### TTTBuilder
Manages temporal claims, purchasing, and tick consumption.
- `purchaseTTT(pool: string, amount: bigint): Promise<string>`: Manually buy TTT from a designated pool. Returns a transaction hash.
- `consumeTick(tokenId: string, tier: string): Promise<boolean>`: Burns a tick for temporal priority processing.
- `verifyBlock(block: Block, record: TTTRecord): AdaptiveMode`: Locally verifies a block's metadata against a TTT temporal claim. Returns `TURBO` or `FULL` mode.

### TimeSynthesis
Coordinates multi-source NTP median consensus.
- `synthesize(): Promise<SynthesizedTime>`: Queries configured NTP sources, calculates the median interval, and returns the unified timestamp.
- `generateProofOfTime(timeData: SynthesizedTime): string`: Creates a 64-byte keccak256 hash artifact representing the PoT.

### DynamicFeeEngine
Interacts with Uniswap V4 pools and Chainlink Oracles to stabilize USD costs.
- `calculateMintFee(tier: string): Promise<{ tttAmount: bigint }>`: Returns the expected TTT cost based on current USD price and tier.
- `calculateBurnFee(tier: string): Promise<{ tttAmount: bigint }>`: Returns the burn cost for consuming temporal ticks.

---

## 3. Tier Selection Guide

The SDK supports 4 operational tiers, designed to balance precision vs. cost.

| Tier | Name | Target Resolution | Cost per Tick (USD) | Use Case |
|---|---|---|---|---|
| `T0_epoch` | Epoch | ~12 seconds | $0.001 | Standard L1 DEX swaps |
| `T1_block` | Block | ~2 seconds | $0.010 | L2 sequencer priority |
| `T2_slot` | Slot | ~500 ms | $0.240 | High-frequency MEV arbitrage |
| `T3_micro` | Micro | ~100 ms | $1.500 | Institutional HFT pipelines |

*Recommendation:* Start with `T1_block` for typical rollup deployments.

---

## 4. Event Handling

You can subscribe to core events to maintain audit logs or trigger off-chain systems.

```typescript
client.on("TTTMinted", (amount, txHash) => {
  console.log(`Successfully minted ${amount} TTT. TX: ${txHash}`);
});

client.on("TTTBurned", (amount, txHash) => {
  console.log(`Burned ${amount} TTT for priority execution. TX: ${txHash}`);
});

client.on("FeeCollected", (usdcAmount, txHash) => {
  console.log(`Protocol fee received: ${usdcAmount} USDC. TX: ${txHash}`);
});
```

---

## 5. Error Handling

When errors occur, they are generally surfaced via structured exceptions. Wrap critical calls in `try/catch` blocks.

| Error Message | Cause | Resolution |
|---|---|---|
| `[EVM] Insufficient gas funds` | The wallet cannot cover the transaction gas cost. | Top-up the `privateKey` wallet with network native tokens (e.g., ETH). |
| `[x402] Insufficient TTT ticks` | Attempted to consume a tick, but balance is empty. | Increase the `threshold` in your `AutoMintConfig`. |
| `[TimeSynthesis] NTP request failed` | Could not reach sufficient NTP servers. | The SDK will gracefully retry. Ensure outbound UDP port 123 is open. |
| `[GRG] Tamper detected` | Block metadata failed the Reed-Solomon/Golay check. | The `AdaptiveSwitch` will automatically drop the builder to `FULL` mode. No action required. |

---

## 6. FAQ

**Q: Do I need to manually trigger `synthesize()`?**  
**A:** No, if you use the standard pipeline integration (via `TTTBuilder`), TimeSynthesis runs automatically before a tick is consumed.

**Q: What happens if Chainlink is down?**  
**A:** The `DynamicFeeEngine` employs a 1800-second staleness check. If the oracle goes stale, it falls back to a hardcoded `fallbackPriceUsd` to prevent mint halting.

**Q: Can I run multiple `TTTClient` instances?**  
**A:** Yes, but ensure they manage separate nonces or operate from distinct wallets to prevent transaction replacement errors on the EVM.

**Q: How does the AdaptiveSwitch handle network latency?**  
**A:** It allows a ±100ms tolerance bound. If network latency pushes a block beyond this, it is penalized and dropped to `FULL` mode.

**Q: Why does the SDK require a checksummed address?**  
**A:** Strict validation using `ethers.getAddress()` prevents costly mistakes where funds are sent to inaccessible unchecksummed addresses.

---
title: Verify Your AI Agent's DeFi Transactions in 3 Lines — OpenTTT MCP Server
published: false
description: Give your AI agent cryptographic proof that its DeFi swaps weren't front-run. 5 MCP tools, one npm install, works with Claude, LangChain, and OpenAI.
tags: ai, mcp, defi, ethereum
cover_image:
---

Your AI agent just executed a $50K swap on Uniswap. It reports success. But was the transaction front-run? Was the ordering manipulated between the moment your agent signed and the moment it landed on-chain?

You have no idea. And neither does your agent.

## The Problem

AI agents executing DeFi transactions operate in a trust vacuum. The agent signs a swap, submits it to a mempool, and hopes for the best. Between submission and inclusion, MEV bots can sandwich the transaction, reorder it, or extract value from it. Your agent gets a worse price. You lose money. Nobody notices until the P&L looks wrong.

The missing piece: **cryptographic proof of transaction ordering** — a timestamp anchor generated *before* the transaction hits the chain, verifiable *after* it lands.

## The Solution: OpenTTT Proof of Time

[OpenTTT](https://github.com/Helm-Protocol/OpenTTT) generates **Proof of Time (PoT)** anchors for every transaction your agent touches. It works in three layers:

1. **Time Synthesis** — Fetches timestamps from multiple independent HTTPS sources (NIST, Google, Cloudflare, Apple), computes a median with uncertainty bounds. No single point of failure.
2. **GRG Integrity Pipeline** — Multi-layer cryptographic pipeline encodes transaction data into integrity shards. If any shard is tampered with, verification fails.
3. **Ed25519 Signing** — Every PoT anchor is signed with an ephemeral Ed25519 keypair for non-repudiation.

The result: a `potHash` your agent can store, verify later, and use as evidence that the transaction ordering was honest.

## 3-Line Integration (MCP)

```bash
npm install @helm-protocol/ttt-mcp
```

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ttt": {
      "command": "npx",
      "args": ["@helm-protocol/ttt-mcp"]
    }
  }
}
```

That's it. Your Claude agent now has 5 new tools.

## The 5 MCP Tools

### `pot_generate` — Anchor a transaction

```
Use pot_generate with txHash 0xabc...def, chainId 8453, poolAddress 0x123...456
```

Returns: `potHash`, timestamp with stratum and uncertainty, GRG integrity shards, Ed25519 signature.

### `pot_verify` — Check integrity

```
Use pot_verify with potHash 0x..., grgShards [...], chainId 8453, poolAddress 0x...
```

Returns: `valid: true/false`, current mode (`turbo` or `full`), reconstructed byte count.

### `pot_query` — Browse PoT history

Query local logs and the on-chain subgraph. Filter by time range, limit results.

### `pot_stats` — Aggregated metrics

```
Use pot_stats with period "week"
```

Returns: total swaps, turbo/full split, turbo ratio for the period.

### `pot_health` — System status

Returns: time source health, subgraph sync status, server uptime, signer public key.

## LangChain Integration

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { TimeSynthesis, GrgPipeline, PotSigner } from "openttt";

const timeSynth = new TimeSynthesis();
const potSigner = new PotSigner();

const potTool = new DynamicStructuredTool({
  name: "pot_generate",
  description: "Generate Proof of Time for a DeFi transaction",
  schema: z.object({
    txHash: z.string(),
    chainId: z.number(),
    poolAddress: z.string(),
  }),
  func: async ({ txHash, chainId, poolAddress }) => {
    const pot = await timeSynth.generateProofOfTime();
    const potHash = TimeSynthesis.getOnChainHash(pot);
    const txData = new TextEncoder().encode(txHash);
    const shards = GrgPipeline.processForward(txData, chainId, poolAddress);
    const sig = potSigner.signPot(potHash);
    return JSON.stringify({ potHash, stratum: pot.stratum, shards: shards.length, sig: sig.issuerPubKey });
  },
});
```

## OpenAI Function Calling

```typescript
const tools = [{
  type: "function",
  function: {
    name: "pot_generate",
    description: "Generate a Proof of Time anchor for a DeFi swap",
    parameters: {
      type: "object",
      properties: {
        txHash: { type: "string", description: "Transaction hash (0x-prefixed)" },
        chainId: { type: "number", description: "EVM chain ID (8453 = Base)" },
        poolAddress: { type: "string", description: "DEX pool address" },
      },
      required: ["txHash", "chainId", "poolAddress"],
    },
  },
}];
// Handle tool_calls in the response, call your OpenTTT backend, return results
```

## Live on Base Sepolia

OpenTTT is deployed and indexing on Base Sepolia today. The subgraph tracks every PoT anchor on-chain in real time:

```
https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0
```

The first Uniswap V4 test pool is live — **TestTTT/USDC (0.3% fee)** on Base Sepolia:
- Pool ID: `0x901f76c0fca9d171688a530da068756b4b16866170c5ea10519d2a725041527c`

**4,240+ PoT records** generated across 3 channels: DEX swaps (1,852+), direct mints (100+), and MCP AI agent calls (2,288+). The MCP channel generates PoTs **faster** than on-chain DEX swaps — proving AI agents are first-class citizens in the OpenTTT ecosystem. HTTP-based agent proofs outpace chain settlement speed.

Turbo mode (honest ordering confirmed) vs. Full mode (requires deeper verification) — the protocol adapts automatically.

## How Turbo/Full Works

When your agent's transactions are consistently ordered honestly, OpenTTT switches to **turbo mode** — faster verification, lower overhead. If ordering anomalies are detected, it falls back to **full mode** with complete GRG pipeline verification. Honest builders get rewarded with speed. Dishonest ones get slowed down. No governance votes. No slashing. Pure economics.

## Links

- **npm (MCP server):** [`@helm-protocol/ttt-mcp`](https://www.npmjs.com/package/@helm-protocol/ttt-mcp)
- **npm (SDK):** [`openttt`](https://www.npmjs.com/package/openttt)
- **GitHub:** [github.com/Helm-Protocol/OpenTTT](https://github.com/Helm-Protocol/OpenTTT)
- **IETF Draft:** [draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- **Subgraph:** [Base Sepolia Explorer](https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0)

---

Star us on GitHub: [github.com/Helm-Protocol/OpenTTT](https://github.com/Helm-Protocol/OpenTTT)

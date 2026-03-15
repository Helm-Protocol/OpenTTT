# @helm-protocol/ttt-mcp

> Reference implementation of [draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) (IETF Experimental)

**MCP Server for OpenTTT — Proof of Time tools for AI agents**

> AI Agent A and Agent B both trigger a payment at the same time.
> Who was first?
>
> OpenTTT answers this with cryptographic Proof of Time — synthesized from
> multiple independent time sources, verified through GRG integrity shards,
> and signed with Ed25519 for non-repudiation.

## Quick Start

```bash
npm install @helm-protocol/ttt-mcp
```

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "ttt": {
      "command": "npx",
      "args": ["@helm-protocol/ttt-mcp"]
    }
  }
}
```

That's it. Your AI agent now has access to 5 Proof of Time tools.

## Tools

| Tool | Description |
|------|-------------|
| `pot_generate` | Generate a Proof of Time for a transaction |
| `pot_verify` | Verify a Proof of Time using its hash and GRG shards |
| `pot_query` | Query PoT history from local log and on-chain subgraph |
| `pot_stats` | Get turbo/full mode statistics for a time period |
| `pot_health` | Check system health: time sources, subgraph sync, uptime |

## Tool Parameters

### pot_generate

Generate a Proof of Time for a transaction. Returns potHash, timestamp, stratum, and GRG integrity shards.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| txHash | string | Yes | Transaction hash (hex with 0x prefix) |
| chainId | number | Yes | Chain ID (e.g. 8453 for Base, 84532 for Base Sepolia) |
| poolAddress | string | Yes | DEX pool contract address |

### pot_verify

Verify a Proof of Time using its hash and GRG shards. Returns validity, mode (turbo/full), and timestamp.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| potHash | string | Yes | PoT hash to verify (hex with 0x prefix) |
| grgShards | string[] | Yes | Array of hex-encoded GRG integrity shards |
| chainId | number | Yes | EVM chain ID (e.g. 84532 for Base Sepolia) |
| poolAddress | string | Yes | Uniswap V4 pool address (0x-prefixed) |

### pot_query

Query Proof of Time history from local log and on-chain subgraph.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startTime | number | No | Start time (unix ms). Default: 24h ago |
| endTime | number | No | End time (unix ms). Default: now |
| limit | number | No | Max entries to return. Default: 100, max: 1000 |

### pot_stats

Get PoT statistics: total swaps, turbo/full counts, and turbo ratio for a given period.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| period | `"day"` \| `"week"` \| `"month"` | Yes | Time period for statistics |

### pot_health

Check PoT system health: time source status, subgraph sync, server uptime, and current mode.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | — | — | This tool takes no parameters |

## Example: Generate and Verify a PoT

```typescript
// In your AI agent's tool call:
const pot = await pot_generate({
  txHash: "0xabc123...",
  chainId: 84532,
  poolAddress: "0xdef456..."
});

// pot.potHash — unique Proof of Time hash
// pot.grgShards — GRG integrity shards for verification
// pot.timestamp — synthesized nanosecond timestamp
// pot.mode — "turbo" (honest) or "full" (requires full verification)

const verification = await pot_verify({
  potHash: pot.potHash,
  grgShards: pot.grgShards
});
// verification.valid — true if integrity shards reconstruct correctly
```

## How It Works

1. **Time Synthesis** — Queries multiple independent time sources (NIST, Google, Cloudflare) via HTTPS/NTP and synthesizes a median timestamp with uncertainty bounds
2. **GRG Pipeline** — Encodes transaction data through a Golomb-Rice + Reed-Solomon + Golay(24,12) integrity pipeline, producing verifiable shards
3. **Ed25519 Signing** — Signs the PoT hash for non-repudiation
4. **Adaptive Mode** — Honest builders get `turbo` mode (fast, profitable); tampered sequences get `full` mode (slow, costly) — natural economic selection

## Claude Desktop Configuration

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

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Requirements

- Node.js >= 18
- Network access for time synthesis (HTTPS to time.nist.gov, time.google.com, time.cloudflare.com)

## Learn More

- [OpenTTT SDK](https://www.npmjs.com/package/openttt) — The underlying SDK
- [IETF Draft: draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) — TTTPS Protocol Specification
- [Helm Protocol](https://github.com/Helm-Protocol) — GitHub

## License

MIT

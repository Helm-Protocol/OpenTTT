# MCP Registry Publication Prep: @helm-protocol/ttt-mcp

> Prepared 2026-03-15. Do NOT submit until Jay approves.

## Important: Registry, Not PR

The MCP ecosystem **no longer accepts PRs** to `modelcontextprotocol/servers` for new server listings.
New servers must be published to the **MCP Server Registry** via the `mcp-publisher` CLI tool.

- Registry: https://registry.modelcontextprotocol.io/
- Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx

---

## Step 1: Add `mcpName` to package.json

```diff package.json
 {
   "name": "@helm-protocol/ttt-mcp",
   "version": "0.1.2",
+  "mcpName": "io.github.helm-protocol/ttt",
   "description": "MCP Server for OpenTTT — Proof of Time tools for AI agents",
```

The `mcpName` must match the `name` field in `server.json` (Step 3).
With GitHub auth, it must start with `io.github.helm-protocol/`.

## Step 2: Publish to npm

```bash
cd ~/.tikitaka/sdk/mcp
npm run build
npm publish --access public
```

Verify: https://www.npmjs.com/package/@helm-protocol/ttt-mcp

## Step 3: Create server.json

Create `server.json` in the MCP package root (or use `mcp-publisher init`):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.helm-protocol/ttt",
  "description": "Proof of Time tools for AI agents. Generate, verify, and query cryptographic timestamps for DeFi transaction ordering. Prevents front-running and MEV attacks using multi-source time synthesis (NIST, Google, Cloudflare) and GRG integrity verification.",
  "repository": {
    "url": "https://github.com/Helm-Protocol/OpenTTT",
    "source": "github"
  },
  "version": "0.1.2",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@helm-protocol/ttt-mcp",
      "version": "0.1.2",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

## Step 4: Install mcp-publisher and Authenticate

```bash
# Install
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Login with GitHub (Helm-Protocol org)
mcp-publisher login github
```

## Step 5: Publish to Registry

```bash
cd ~/.tikitaka/sdk/mcp
mcp-publisher publish
```

Verify:
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.helm-protocol/ttt"
```

---

## Registry Listing Details

| Field | Value |
|-------|-------|
| **Server Name** | `io.github.helm-protocol/ttt` |
| **npm Package** | `@helm-protocol/ttt-mcp` |
| **Category** | DeFi / Blockchain |
| **Version** | 0.1.2 |
| **License** | MIT |
| **Transport** | stdio |
| **Node.js** | >= 18 |
| **Repository** | https://github.com/Helm-Protocol/OpenTTT |

## 5 Tools Provided

| Tool | Description |
|------|-------------|
| `pot_generate` | Generate a Proof of Time for a transaction. Returns potHash, timestamp, stratum, GRG integrity shards, and Ed25519 signature. |
| `pot_verify` | Verify a Proof of Time using its hash and GRG shards. Returns validity, adaptive mode (turbo/full), and timestamp. |
| `pot_query` | Query PoT history from local in-memory log and on-chain subgraph (Base Sepolia). Supports time range and limit filters. |
| `pot_stats` | Get PoT statistics: total swaps, turbo/full counts, turbo ratio for day/week/month periods. |
| `pot_health` | Check system health: time source status, subgraph sync state, server uptime, current adaptive mode, signer public key. |

## Quick Start (for Registry Description)

```bash
npm install @helm-protocol/ttt-mcp
```

Claude Desktop config (`claude_desktop_config.json`):
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

## Example Usage

```
User: "Generate a proof of time for my swap on Base Sepolia"

Agent calls pot_generate:
  txHash: "0xabc123..."
  chainId: 84532
  poolAddress: "0xdef456..."

Returns:
  potHash: "0x..."
  timestamp: "1742000000000000000" (nanosecond precision)
  stratum: 1
  confidence: 1.0
  sources: 3
  grgShards: ["a1b2...", "c3d4...", ...]
  signature: { issuerPubKey, signature, issuedAt }

Agent calls pot_verify:
  potHash: "0x..."
  grgShards: [...]
  chainId: 84532
  poolAddress: "0xdef456..."

Returns:
  valid: true
  mode: "turbo"
```

## Checklist Before Submission

- [ ] `npm publish --access public` succeeds for latest version
- [ ] `mcpName` added to package.json
- [ ] `server.json` created and validated
- [ ] `mcp-publisher login github` authenticated
- [ ] Jay approves external publication
- [ ] No E8/8D/lattice internals exposed in any public-facing text

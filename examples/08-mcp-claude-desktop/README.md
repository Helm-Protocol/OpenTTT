# Example 08 — MCP + Claude Desktop Integration

Connect OpenTTT to Claude Desktop via the Model Context Protocol (MCP).
Claude can then call `get_proof_of_time`, `verify_ordering`, and `get_status`
as native tools from within a conversation.

## What this shows

- Configure Claude Desktop to load the OpenTTT MCP server
- Claude calls PoT generation as a tool call (no code required from user)
- Works with `httpOnly()` mode — no wallet needed for read-only operations

## Files

| File | Purpose |
|------|---------|
| `claude_desktop_config.json` | Drop-in config for Claude Desktop |

## Setup

1. Copy `claude_desktop_config.json` into your Claude Desktop config directory:

   **macOS:**
   ```bash
   cp examples/08-mcp-claude-desktop/claude_desktop_config.json \
     ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

   **Linux:**
   ```bash
   cp examples/08-mcp-claude-desktop/claude_desktop_config.json \
     ~/.config/Claude/claude_desktop_config.json
   ```

2. Restart Claude Desktop.

3. Ask Claude: *"Generate a Proof of Time for a Base swap"*

## Available MCP tools

| Tool | Description |
|------|-------------|
| `get_proof_of_time` | Generate a PoT from multi-source time synthesis |
| `verify_ordering` | Check if a transaction ordering matches its PoT |
| `get_status` | Check TTT node status and current adaptive mode |

## httpOnly mode

No private key required for read-only tool calls:

```typescript
import { TTTClient } from 'openttt';

const client = await TTTClient.httpOnly({
  baseUrl: 'https://ttt.helmprotocol.com'
});

const pot = await client.getProofOfTime();
```

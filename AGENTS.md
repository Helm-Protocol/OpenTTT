# OpenTTT Agent Specification

Proof-of-Time temporal attestation for AI agent transactions.

## Tools

### ttt_pot_generate
Generate a cryptographic Proof-of-Time before a transaction.
- **Input**: `tx_hash` (string), `chain_id` (int, default: 84532)
- **Output**: `{ potHash, timestamp, sources, confidence, nonce }`
- **Auth**: None required (httpOnly mode available)

### ttt_pot_verify
Verify a Proof-of-Time after transaction confirms.
- **Input**: `pot_hash` (string)
- **Output**: `{ valid, timestamp, sources }`

### ttt_pot_query
Query historical PoT records.
- **Input**: `pot_hash` (string)
- **Output**: Full PoT record with on-chain anchor

## Quick Start

```bash
npm install openttt          # JS/TS
pip install langchain-openttt # Python
npx @helm-protocol/ttt-mcp   # Claude Desktop MCP
```

```typescript
import { HttpOnlyClient } from "openttt";
const client = new HttpOnlyClient();
const pot = await client.generatePoT();
```

## Available Integrations
- npm: openttt, @helm-protocol/ttt-mcp, @helm-protocol/x402-pot, @helm-protocol/plugin-openttt
- PyPI: langchain-openttt
- MCP Registry: io.github.Helm-Protocol/openttt-pot

## Links
- GitHub: https://github.com/Helm-Protocol/OpenTTT
- IETF Draft: https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/
- Demo: https://helm-protocol.github.io/OpenTTT/demo/

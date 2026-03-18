# OpenTTT — OpenAI Agents SDK Integration

**Problem**: DEX swaps get front-run. Your agent can't prove transaction ordering.

**Solution**: `ttt_pot_generate` anchors a transaction with cryptographic timestamps
from 4 independent atomic clock sources (NIST, Apple, Google, Cloudflare).
`ttt_pot_verify` checks ordering after the tx lands on-chain.

**Result**: Your agent detects MEV attacks in two tool calls.

## Installation

```bash
pip install openai-agents httpx
```

Set the MCP server URL (default: `http://localhost:3000`):

```bash
export TTT_MCP_URL=http://localhost:3000
```

## Quick Start

```python
from agents import Agent, Runner
from openai_agents_openttt import ttt_pot_generate, ttt_pot_verify

agent = Agent(
    name="DeFi Security Agent",
    instructions=(
        "You are a DeFi security agent. "
        "Before submitting a transaction, call ttt_pot_generate to anchor it in time. "
        "After it confirms, call ttt_pot_verify to check for frontrunning."
    ),
    tools=[ttt_pot_generate, ttt_pot_verify],
)

result = Runner.run_sync(
    agent,
    "Anchor tx 0xabc123... on Base Sepolia (chain 84532) before submission.",
)
print(result.final_output)
```

## Tool Reference

### `ttt_pot_generate(tx_hash, chain_id=84532)`

Call **before** submitting a transaction.

| Param | Type | Description |
|-------|------|-------------|
| `tx_hash` | `str` | Transaction hash (0x-prefixed hex) |
| `chain_id` | `int` | EVM chain ID. 84532 = Base Sepolia, 8453 = Base Mainnet |

Returns a signed PoT attestation:

```json
{
  "potHash": "0x...",
  "timestamp": "1742000000000000000",
  "uncertainty_ms": 2.5,
  "sources": 4,
  "confidence": 1.0,
  "nonce": "a1b2c3...",
  "expiresAt": "1742000060000"
}
```

### `ttt_pot_verify(pot_hash)`

Call **after** transaction confirms on-chain.

| Param | Type | Description |
|-------|------|-------------|
| `pot_hash` | `str` | PoT hash returned by `ttt_pot_generate` |

Returns ordering proof with frontrunning detection result.

## How It Works

1. Queries 4 independent atomic clock sources simultaneously
2. Synthesizes a median timestamp with confidence score
3. Self-verifies cross-source consistency (stratum-adaptive tolerance)
4. Applies nonce + expiration for replay protection
5. Computes on-chain hash for contract-level verification

## Difference from LangChain Integration

| | OpenAI Agents SDK | LangChain |
|-|-------------------|-----------|
| Style | `@function_tool` decorator | `BaseTool` class |
| Async | Native `async def` | `_arun` override |
| Schema | Auto-inferred from docstring | `args_schema` Pydantic model |

## Learn More

- [IETF Draft: Proof of Time](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [OpenTTT SDK](https://github.com/Helm-Protocol/OpenTTT)
- [Yellow Paper](https://github.com/Helm-Protocol/OpenTTT/blob/main/YELLOW_PAPER.md)

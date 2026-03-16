# LangChain Integration Publication Prep: OpenTTT Proof-of-Time Tool

> Prepared 2026-03-15. Do NOT submit until Jay approves.

## Important: Standalone Package, Not PR to @langchain/community

LangChain **no longer accepts new integrations** to the `@langchain/community` package.
New integrations must be published as **standalone npm packages**.

**Strategy**: Publish as part of the `openttt` npm package (already published), then open an issue/discussion on `langchain-ai/langchainjs` to request inclusion in the recommended integrations list.

---

## PR / Issue Title

**"Add Proof-of-Time verification tool for DeFi transaction ordering"**

## Description

OpenTTT provides a LangChain `StructuredTool` integration (`VerifyProofOfTimeTool`) that enables AI agents to verify DeFi transaction ordering using cryptographic Proof of Time.

### Problem

DEX swaps are vulnerable to front-running and MEV attacks. AI agents operating in DeFi have no way to cryptographically verify transaction ordering.

### Solution

`verify_proof_of_time` generates timestamps from 3+ independent atomic clock sources (NIST, Google, Cloudflare, Apple), synthesizes a median with uncertainty bounds, and produces a verifiable proof with Ed25519 signature and on-chain hash.

### Use Cases

1. **DeFi Security Agents** -- Detect front-running by comparing PoT timestamps against block inclusion order
2. **MEV Protection Bots** -- Anchor swap sequences with cryptographic timestamps before submission
3. **Audit Agents** -- Verify historical transaction ordering for compliance reporting
4. **Oracle Agents** -- Provide verifiable time attestations for price feed ordering

## Installation

```bash
npm install openttt @langchain/core zod
```

## Code Example

```typescript
import { VerifyProofOfTimeTool } from "openttt/integrations/langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// 1. Create the tool
const potTool = new VerifyProofOfTimeTool();

// 2. Wire into your agent
const llm = new ChatOpenAI({ model: "gpt-4o" });
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a DeFi security agent. Use verify_proof_of_time to check transaction ordering."],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({ llm, tools: [potTool], prompt });
const executor = new AgentExecutor({ agent, tools: [potTool] });

// 3. Run
const result = await executor.invoke({
  input: "Verify ordering for tx 0xabc123... on Base (chain 8453) pool 0xdef456...",
});

console.log(result.output);
```

## Tool Specification

| Field | Value |
|-------|-------|
| **Tool Name** | `verify_proof_of_time` |
| **Class** | `VerifyProofOfTimeTool` (extends `StructuredTool`) |
| **Package** | `openttt` |
| **Import** | `from "openttt/integrations/langchain"` |

### Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `txHash` | string | Yes | Transaction hash (0x-prefixed hex) |
| `chainId` | number | Yes | EVM chain ID (8453 = Base, 84532 = Base Sepolia) |
| `poolAddress` | string | Yes | DEX pool contract address (0x-prefixed) |

### Output (JSON string)

```json
{
  "verified": true,
  "txHash": "0xabc123...",
  "chainId": 8453,
  "poolAddress": "0xdef456...",
  "proof": {
    "timestamp": "1742000000000000000",
    "uncertainty_ms": 2.5,
    "sources": 3,
    "stratum": 1,
    "confidence": 1.0,
    "nonce": "a1b2c3...",
    "expiresAt": "1742000060000",
    "onChainHash": "0x..."
  },
  "sourceReadings": [
    { "source": "nist", "timestamp": "...", "uncertainty_ms": 1.2 },
    { "source": "google", "timestamp": "...", "uncertainty_ms": 2.0 },
    { "source": "cloudflare", "timestamp": "...", "uncertainty_ms": 3.1 }
  ]
}
```

### Configuration

```typescript
// Custom time sources
const tool = new VerifyProofOfTimeTool({
  timeSources: ["nist", "google", "cloudflare"],
});
```

## Test Coverage

The underlying `openttt` SDK has 112 tests passing:

- `TimeSynthesis` -- Multi-source time generation, median synthesis, uncertainty calculation
- `GrgPipeline` -- Multi-layer forward/inverse data integrity pipeline
- `PotSigner` -- Ed25519 key generation, signing, verification
- `AdaptiveSwitch` -- Turbo/full mode switching based on sequence integrity
- `TTTClient` -- End-to-end PoT generation and verification

Integration-specific tests to add:
- [ ] `VerifyProofOfTimeTool` instantiation and schema validation
- [ ] `_call()` returns valid JSON with all required fields
- [ ] Error handling returns `{ verified: false, error: "..." }`
- [ ] Custom time source configuration

## How It Works

1. **Time Synthesis** -- Queries NIST, Google, Cloudflare, Apple time sources simultaneously
2. **Median Fusion** -- Synthesizes a median timestamp with confidence score and uncertainty bounds
3. **Self-Verification** -- Cross-source consistency check, nonce replay protection, expiration validation
4. **On-Chain Hash** -- Computes keccak256 hash for optional smart contract verification

## References

- [OpenTTT SDK (npm)](https://www.npmjs.com/package/openttt)
- [OpenTTT GitHub](https://github.com/Helm-Protocol/OpenTTT)
- [IETF Draft: TTTPS Protocol](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [Yellow Paper](https://github.com/Helm-Protocol/OpenTTT/blob/main/YELLOW_PAPER.md)
- License: MIT

## Submission Plan

1. Ensure `openttt` latest version is published on npm with the LangChain integration export path
2. Open a GitHub Discussion on `langchain-ai/langchainjs` requesting inclusion in recommended integrations
3. Provide this document as context for the discussion
4. Link to npm package and GitHub repo as evidence of working integration

## Checklist Before Submission

- [ ] `openttt` npm package published with `integrations/langchain` export
- [ ] Import path `from "openttt/integrations/langchain"` works
- [ ] Integration-specific tests written and passing
- [ ] Jay approves external publication
- [ ] No E8/8D/lattice internals exposed in any public-facing text

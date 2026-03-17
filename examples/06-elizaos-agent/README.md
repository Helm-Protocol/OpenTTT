# Example 06 — ElizaOS Agent Integration

Integrate OpenTTT Proof of Time into an [ElizaOS](https://github.com/elizaos/eliza) agent
so every on-chain action carries a cryptographic timestamp.

## What this shows

- Register an ElizaOS character with OpenTTT PoT middleware
- Every swap/transfer action generates a PoT before submission
- Adaptive mode (TURBO vs FULL) determined automatically per transaction

## Files

| File | Purpose |
|------|---------|
| `character.json` | ElizaOS character definition with OpenTTT plugin config |

## Prerequisites

```bash
npm install @elizaos/core openttt
```

## Usage

```bash
# Set your private key
export PRIVATE_KEY=0x...

# Run the agent
npx elizaos --character examples/06-elizaos-agent/character.json
```

## How it works

1. Agent receives a task (e.g. "swap 1 ETH for USDC on Base")
2. OpenTTT plugin calls `TimeSynthesis.synthesize()` — multi-source time proof
3. PoT is attached as `hookData` to the transaction
4. Uniswap V4 hook verifies PoT on-chain
5. Honest ordering → TURBO mode (fast + profitable)
6. Tampered ordering → FULL mode (slow + penalized naturally)

## httpOnly mode

For testing without a live RPC, use `httpOnly()`:

```typescript
import { TTTClient } from 'openttt';

const client = await TTTClient.httpOnly({
  baseUrl: 'https://ttt.helmprotocol.com'
});
```

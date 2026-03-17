# Example 07 — Multi-Agent Ordering Demo

Shows how multiple agents competing for the same block slot get ordered fairly
by OpenTTT Proof of Time. First submitted PoT wins — no MEV bribing.

## What this shows

- 3 agents submit swaps simultaneously
- Each generates a PoT with multi-source time synthesis
- Ordering is determined by PoT timestamp, not gas price
- Dishonest agent (tampered timestamp) gets FULL mode penalty automatically

## Files

| File | Purpose |
|------|---------|
| `ordering_demo.ts` | Runnable demo — 3 agents, 1 block, fair ordering |

## Prerequisites

```bash
npm install openttt
```

## Usage

```bash
npx ts-node examples/07-multi-agent-ordering/ordering_demo.ts
```

## Expected output

```
Agent A: PoT @ 1710000000001 ns  → TURBO (50ms)
Agent B: PoT @ 1710000000003 ns  → TURBO (50ms)
Agent C: PoT @ 1710000000099 ns  → FULL  (127ms) ← tampered
Ordering: A → B → C
```

## Key insight

Traditional MEV: highest gas price wins → arms race, users lose.
OpenTTT: earliest honest PoT wins → physics-based, no arms race.

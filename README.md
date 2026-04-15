# OpenTTT

> **Reference implementation of [draft-helmprotocol-tttps-02](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)**

**OpenSSL for Time** — TLS-grade Proof-of-Time for distributed systems.

OpenTTT provides cryptographic proof that an event occurred at a specific time, independently verifiable by anyone without trusting the issuer. Where TLS authenticates *identity*, OpenTTT proves *when*.

[![npm](https://img.shields.io/npm/v/openttt)](https://www.npmjs.com/package/openttt)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml/badge.svg)](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)]()

> If this project is useful to you, please [star it on GitHub](https://github.com/Helm-Protocol/OpenTTT) — it helps others find it.

```
npm install openttt
```

---

## Why OpenTTT

Current timestamp verification relies on **trust**: systems assume servers report accurate times. OpenTTT proves whether they did.

| | NTP / System Time | OpenTTT |
|---|---|---|
| **Mechanism** | Trust the server | Cryptographic proof |
| **Enforcement** | None | Economic + cryptographic |
| **Forgery** | Trivial | Mathematically detectable (Theorem 0) |
| **Time source** | Single server | Multi-source Roughtime synthesis |

**The core insight** (Theorem 0 — Inflow-to-Proof): A forged timestamp T′ ≠ T produces a different GRG commitment, causing Ed25519 verification to fail. Issuer timestamp manipulation is mathematically detectable, not merely procedurally controlled.

```
GRG_Commitment = GRG(P ‖ D_chain, ctx_id)
D_chain = SHA-256(k Roughtime attestations, k ≥ 3)
```

---

## Why OpenTTT, not Google Roughtime?

A common question: *"Google Roughtime already solves timestamp verification — why do we need OpenTTT?"*

The answer: **Roughtime and OpenTTT operate at completely different points in the lifecycle.**

| | Google Roughtime | OpenTTT |
|---|---|---|
| **When it acts** | After the fact | Before state is committed |
| **What it does** | Proves a timestamp was wrong | Rejects invalid timestamps at ingestion |
| **Enforcement** | Audit trail only | Cryptographic rejection |
| **Use case** | Security auditing, forensics | Real-time enforcement |

> Roughtime proves time fraud happened. OpenTTT makes time fraud economically irrational before it can happen.

OpenTTT uses Roughtime as its internal time source (k ≥ 3 servers), then adds the GRG integrity pipeline on top.

---

## Quick Start

### Try it in 30 seconds

```typescript
import { HttpOnlyClient } from "openttt";

const client = new HttpOnlyClient();
const pot = await client.generatePoT();
console.log(pot.timestamp, pot.confidence, pot.sources);

const valid = client.verifyPoT(pot);
console.log("Valid:", valid); // true
```

No external dependencies. Just verified time from independent Roughtime sources (Google, Cloudflare, Chainpoint).

### Rust SDK

```rust
use openttt::roughtime::{build_chain, verify_chain_against_pot};

let chain = build_chain(&["roughtime.int.cfturnstile.com:2002"]).await?;
let result = verify_chain_against_pot(&chain, &pot)?;
// result.gate2_accepted: bool
// result.age_ms: u64
```

---

## Progressive Disclosure

OpenTTT is designed around progressive disclosure. Start simple, add control as you need it.

```typescript
// Level 0: Pure verification (no config needed)
import { HttpOnlyClient } from "openttt";
const pot = await new HttpOnlyClient().generatePoT();

// Level 1: Custom time sources
import { TTTClient } from "openttt";
const ttt = await TTTClient.create({ sources: ["google", "cloudflare"] });

// Level 2: Custom tiers and verification pipeline
const pot = await ttt.generate({ tier: "T1_block", ctx_id: "my-context" });
const ok  = await ttt.verify(pot);
```

---

## Signer Options

| Type | Use Case | Config |
|------|----------|--------|
| `local` | Development, testing | `{ type: "local", privateKey }` |
| `env` | CI/CD, Docker | `{ type: "env" }` (reads `TTT_PRIVATE_KEY`) |
| `aws-kms` | Production, key management | `{ type: "aws-kms", keyId }` |
| `gcp-kms` | GCP deployments | `{ type: "gcp-kms", keyName }` |

---

## Tiers

Tiers define the acceptable time window for a PoT. Tighter tiers → stronger guarantees → higher verification cost.

| Tier | Window | Use Case |
|------|--------|----------|
| `T0_epoch` | 60,000 ms | Epoch-level ordering |
| `T1_block` | 2,000 ms | Block-level ordering **(default)** |
| `T2_slot` | 12,000 ms | Slot-level (L1) |
| `T3_micro` | 100 ms | High-frequency applications |

```typescript
const pot = await ttt.generate({ tier: "T1_block" });
```

---

## Health Monitoring

```typescript
ttt.on("turbo",   () => console.log("TURBO mode — 50ms verification"));
ttt.on("full",    () => console.log("FULL mode  — 127ms verification"));
ttt.on("warning", (e) => console.warn(e.message));

const health = await ttt.health();
// { mode: "TURBO", latency_ms: 47, sources: 3 }
```

---

## Subgraph Testing

OpenTTT uses The Graph subgraph as a test oracle for end-to-end pipeline validation. The subgraph indexes PoT records and allows integration tests to verify on-chain ordering against cryptographic proofs.

```typescript
// Integration test against subgraph
import { SubgraphVerifier } from "openttt/testing";

const verifier = new SubgraphVerifier({
  endpoint: "https://api.thegraph.com/subgraphs/name/helm-protocol/openttt"
});

const result = await verifier.verifySequence(transactions);
// { ordered: true, proof_valid: true, latency_ms: 47 }
```

**[▶ Interactive GRG Pipeline Explainer](https://helm-protocol.github.io/OpenTTT/demo/grg-explainer.html)** — Visual walkthrough of the GRG stages and Byzantine elimination.

---

## Networks

| Network | Chain ID | Factory |
|---------|----------|---------|
| Testnet | — | `TTTClient.forTestnet(config)` |
| Custom  | any | `TTTClient.create({ rpcUrl, chainId })` |

---

## API Reference

### Client

| Method | Description |
|--------|-------------|
| `TTTClient.create(config)` | Create client with explicit config |
| `TTTClient.forTestnet(config)` | Testnet factory |
| `ttt.generate(opts?)` | Generate a new PoT |
| `ttt.verify(pot)` | Verify a PoT (Gate2 + HMAC + Ed25519) |
| `ttt.health()` | Get current mode and latency |
| `ttt.startAutoMint()` | Background PoT generation |
| `ttt.stop()` | Graceful shutdown |

### Verification Pipeline (§4.5, draft-02)

```
0   Future-timestamp check     < 1 ns
1a  TLS binding_key verify     ~ 6 µs   (§7.1)
1b  AEAD early rejection       ~ 1 µs   (§9.8, ChaCha20-Poly1305)
2   HMAC Gate1                 ~ 6 µs   (context binding)
3   Ed25519 verify             ~46 µs   (session only, not per-packet)
4   Recency Gate2              ~  3 ns  (O(1) saturating_sub)
5   Nonce freshness            ~ 1 µs   (256-bit dedup)
```

### TimeSynthesis

| Method | Description |
|--------|-------------|
| `TimeSynthesis.synthesize(sources)` | Multi-source time synthesis |
| `TimeSynthesis.getDigest(pot)` | SHA-256 chain digest for GRG input |

---

## GRG Integrity Pipeline (§5, draft-02)

```
Encode: Data → [Golomb-Rice G₁] → [Reed-Solomon R] → [Golay(23,12,7) G₂] → [HMAC H] → Shards
Decode: Shards → [HMAC verify] → [Golay correct] → [RS reconstruct] → [Golomb decompress] → Data
```

| Stage | Algorithm | Property |
|-------|-----------|----------|
| G₁ | Golomb-Rice (m=16) | Timestamp delta compression |
| R  | RS GF(2⁸) Vandermonde k=4 n=6 | 33% packet loss tolerance |
| G₂ | **Golay(23,12,7)** | Perfect binary code · d_min=7 · t=3 · 1.917× |
| H  | HMAC-SHA256 | Context binding (pool/chain separation) |

**Why G23?** G23 [23,12,7] achieves the Hamming sphere-packing bound exactly (perfect code). Bandwidth 1.917× vs G24's 2.000× — at scale, 4.17% bandwidth savings per shard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Helm Issuer (Private)                                  │
│  grg-core: GRG pipeline + Ed25519 signing              │
│  POST /v1/pot/generate                                  │
│  POST /v1/pot/verify                                    │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS / QUIC (ALPN: tttps/1)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  OpenTTT (Public — this repo)                           │
│  src/roughtime/                                         │
│    chain.rs          Roughtime chain builder            │
│    pot_crypto.rs     Ed25519 verify + HMAC Gate1       │
│    wire.rs           TLV parser (draft-19 §5)          │
│    adaptive_switch   TURBO/FULL state machine          │
│    quic_transport    §7.2 frame + TLS binding_key      │
│    no_std_verify     IoT / ARM / FPGA verifier         │
│  npm: openttt · PyPI: langchain-openttt                │
│  99 tests · release clean                              │
└─────────────────────────────────────────────────────────┘
```

---

## Error Handling

All SDK errors extend `TTTBaseError`:

```typescript
try {
  const ttt = await TTTClient.create({ ... });
  await ttt.generate();
} catch (e) {
  if (e instanceof TTTBaseError) {
    console.error(e.code);    // "STALE_POT" | "HMAC_FAIL" | "ED25519_FAIL" ...
    console.error(e.message);
    console.error(e.context);
  }
}
```

---

## Graceful Shutdown

```typescript
process.on("SIGTERM", async () => {
  await ttt.stop();
  process.exit(0);
});
```

---

## Requirements

- Node.js 18+
- Rust 1.82+ (for Rust SDK)

---

## IETF Draft

This is the reference implementation of `draft-helmprotocol-tttps-02`.

- [IETF Datatracker](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [Roughtime RFC 9557](https://www.rfc-editor.org/rfc/rfc9557.html)

---

## License

BSL-1.1 — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Learn More

- [Draft specification](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [GRG Pipeline explainer](https://helm-protocol.github.io/OpenTTT/demo/grg-explainer.html)

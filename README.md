# OpenTTT

> **Reference implementation of [draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)**

**Cryptographic Proof-of-Time for Distributed Systems** — TLS-grade time verification without trust assumptions.

OpenTTT brings verifiable, Byzantine-fault-tolerant timestamping to any distributed system. Where TLS made HTTP trustworthy, OpenTTT makes ordering and sequencing verifiable. No trust assumptions. No gentleman's agreements. Physics.

[![npm](https://img.shields.io/npm/v/openttt)](https://www.npmjs.com/package/openttt)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml/badge.svg)](https://github.com/Helm-Protocol/OpenTTT/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-386%20passing%20%C2%B7%2032%20suites-brightgreen)]()

```
npm install openttt
```

---

## Why OpenTTT

Current distributed systems rely on **trust** for ordering: services promise fair sequencing, protocols ask nicely, and everyone hopes for the best. OpenTTT proves whether ordering was respected — cryptographically, without a trusted third party.

| | Conventional NTP | OpenTTT |
|---|---|---|
| **Mechanism** | Single-source timestamp | Multi-source synthesized Proof-of-Time |
| **Verification** | Trust the server | Cryptographic multi-anchor proof |
| **Attack detection** | None | 13 Byzantine attack types detected |
| **Enforcement** | Audit after the fact | Real-time rejection at ingestion |
| **Time sources** | One NTP server | NIST + Apple + Google + Cloudflare (parallel) |

**The core insight**: Honest participants receive a Proof-of-Time receipt. A multi-layer data integrity pipeline then verifies whether ordering was respected:

- **Honest node**: Sequence matches → **Turbo mode** (fast verification path) → lower latency → more efficient
- **Dishonest node**: Sequence mismatch → **Full mode** (complete verification path) → higher overhead → naturally exits

No governance vote. No slashing committee. Cheating is simply bad engineering.

---

## Product Suite

OpenTTT is the open-source core of the Helm Protocol product family. The full suite:

| Product | Description | Key Metric |
|---|---|---|
| **OpenTTT / TTTPS** | Byzantine Audit API — cryptographic Proof-of-Time with 13-attack detection | IETF Draft |
| **HYDRA-KV** | LLM inference KV cache accelerator — distributed prefill/decode separation | 3.20× compression, 95.6% dedup |
| **HYDRA-CDN** | Edge delivery with GapVec5 routing and erasure-coded resilience | 30% loss tolerance |
| **HYDRA-AUDIT** | Infrastructure audit with Prometheus, JSON-LD, and Grafana integration | TRAI/CERT-In compatible |

---

## Use Cases

### LLM Inference Acceleration (HYDRA-KV)
KV cache transfer between prefill and decode nodes becomes a bottleneck at scale. HYDRA-KV uses TTTPS timestamps to sequence and audit cache chunks, combined with a multi-layer compression pipeline that achieves 3.20× reduction and 95.6% deduplication.

### Resilient Edge Delivery (HYDRA-CDN)
High-loss network environments (satellite, mobile edge, cross-border) require delivery guarantees that standard CDN protocols cannot provide. HYDRA-CDN uses GapVec5 adaptive routing and erasure coding to tolerate 30% packet loss while maintaining per-chunk TTTPS audit seals.

### Byzantine Audit (TTTPS)
Any distributed system that needs verifiable ordering — financial infrastructure, IoT sensor networks, compliance-regulated APIs — can embed TTTPS to produce tamper-evident Proof-of-Time receipts. 13 Byzantine attack patterns are detected and rejected in real time.

---

## Quick Start

### Proof-of-Time in 30 Seconds — HTTPS Only, No Setup

```typescript
import { HttpOnlyClient } from "openttt";

const client = new HttpOnlyClient();
const pot = await client.generatePoT();
console.log(pot.timestamp, pot.confidence, pot.sources);

const valid = client.verifyPoT(pot);
console.log("Valid:", valid); // true
```

No infrastructure required. Four independent HTTPS time sources (NIST, Apple, Google, Cloudflare) are queried in parallel. The synthesized median produces a confidence-scored Proof-of-Time immediately.

### Server Mode — Continuous PoT Stream

```typescript
import { TTTClient } from "openttt";

const ttt = await TTTClient.create({
  timeSources: ["nist", "google", "cloudflare", "apple"],
  enableGracefulShutdown: true,
});

ttt.startAutoMint();

ttt.onAlert((alert) => {
  // Route to PagerDuty, Grafana, Telegram, etc.
  console.error(`[OpenTTT Alert] ${alert}`);
});
```

### Health Monitoring

```typescript
const health = await ttt.getHealth();
// {
//   healthy: true,
//   checks: { ntpSourcesOk: true, signerAvailable: true, ... },
//   metrics: { mintCount: 142, successRate: 1.0, avgMintLatencyMs: 1847 },
//   alerts: []
// }
```

---

## Architecture

```
TTTClient (entry point)
|-- AutoMintEngine         Continuous PoT generation loop
|   |-- TimeSynthesis      Multi-source NTP median synthesis
|   |   |-- NIST           time.nist.gov  (US national standard)
|   |   |-- Google         time.google.com
|   |   |-- Apple          time.apple.com
|   |   '-- Cloudflare     time.cloudflare.com
|   '-- GRG Pipeline       Multi-layer data integrity (proprietary)
|-- AdaptiveSwitch         TURBO / FULL verification mode state machine
|-- ByzantineDetector      13-pattern attack classifier
'-- Signer Abstraction     PrivateKey | KMS (AWS / GCP)
```

### Time Synthesis

OpenTTT queries multiple atomic clock-synchronized sources in parallel and produces a median-synthesized timestamp with confidence scoring. All readings must fall within a stratum-dependent tolerance of the synthesized median, or the Proof of Time is rejected. Single-source operation triggers a degraded-confidence warning.

### GRG Pipeline

GRG is a multi-layer data integrity pipeline that protects PoT payloads — analogous to how the TLS record protocol protects HTTP payloads. It provides compression, erasure coding, and error correction in a single pass, producing verifiable shards that can be independently validated and reconstructed.

> Implementation details are proprietary. See the [IETF Draft](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) for the abstract specification.

### Adaptive Mode Switching

The enforcement mechanism uses a sliding-window match rate with hysteresis:

- **Entry to Turbo**: high ordering match rate over a sustained window
- **Integrity failure in Turbo**: exponential backoff penalty
- **Design intent**: hard to earn trust, easy to lose it

---

## IETF Draft

OpenTTT implements **draft-helmprotocol-tttps-00** (TTTPS — TLS-grade Time Token Protocol Stack).

> **Abstract**: This document specifies TTTPS, a protocol for generating and verifying cryptographic Proof-of-Time (PoT) tokens using multiple independent time sources. TTTPS provides Byzantine fault tolerance against timestamp manipulation, supports 13 categories of time-based attacks, and is designed for integration into existing transport-layer security stacks without requiring changes to application protocols.

Full draft: [datatracker.ietf.org/doc/draft-helmprotocol-tttps/](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)

---

## API Reference

### TTTClient

| Method | Description |
|---|---|
| `TTTClient.create(config)` | Create and initialize a client |
| `ttt.startAutoMint()` | Start continuous PoT generation |
| `ttt.stopAutoMint()` | Stop the generation loop |
| `ttt.getHealth()` | Returns `HealthStatus` with source connectivity and performance |
| `ttt.onAlert(callback)` | Register a callback for health alerts |
| `ttt.destroy()` | Graceful shutdown |

### TimeSynthesis

| Method | Description |
|---|---|
| `synthesize()` | Query all sources, return median-synthesized timestamp |
| `generateProofOfTime()` | Generate a verifiable PoT with source signatures |
| `verifyProofOfTime(pot)` | Verify all readings are within tolerance of the median |

### GrgPipeline

| Method | Description |
|---|---|
| `GrgPipeline.processForward(data)` | Encode through the multi-layer integrity pipeline |
| `GrgPipeline.processInverse(shards, length)` | Decode with integrity verification |

---

## Error Handling

All SDK errors extend `TTTBaseError` with three actionable fields:

```typescript
import { TTTTimeSynthesisError } from "openttt";

try {
  const pot = await client.generatePoT();
} catch (e) {
  if (e instanceof TTTTimeSynthesisError) {
    console.error(e.message);  // What happened
    console.error(e.reason);   // Why it happened
    console.error(e.fix);      // How to fix it
  }
}
```

| Error Class | Scope |
|---|---|
| `TTTConfigError` | SDK configuration |
| `TTTSignerError` | Signer acquisition or usage |
| `TTTNetworkError` | Connectivity, source availability |
| `TTTTimeSynthesisError` | NTP time synthesis failures |

---

## Requirements

- Node.js >= 18
- TypeScript >= 5.3 (for development)
- Network access to NTP sources (UDP 123 outbound or HTTPS fallback)

**Optional peer dependencies:**

| Package | Required for |
|---|---|
| `@aws-sdk/client-kms` | AWS KMS signer |
| `@google-cloud/kms` | GCP Cloud KMS signer |

---

## License

BSL-1.1 — free for non-commercial use.

**Commercial use** (production bots, hedge funds, prop desks) requires a license.  
→ [kenosian.com/pricing](https://kenosian.com/pricing)

Change Date: 2029-05-28 → Apache 2.0

Full license text: [LICENSE](LICENSE) — Copyright 2026 Helm Protocol.

---

## Links

- [IETF Draft: draft-helmprotocol-tttps-00](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) — Protocol specification
- [Helm Protocol GitHub](https://github.com/Helm-Protocol) — Organization and repositories

---

## Contributing

Bug reports, feature requests, and pull requests are welcome.

- **Bug reports**: Open an issue with a minimal reproduction case.
- **Feature requests**: Open an issue describing the use case and expected behavior.
- **Pull requests**: Fork, make changes, ensure all tests pass (`npm test`), open a PR against `main`.

For significant changes, open an issue first to discuss the approach.

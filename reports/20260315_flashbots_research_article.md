# Proof-of-Time: From Trust-Based to Physics-Based Transaction Ordering

**Authors**: OpenTTT Research Team
**Date**: March 15, 2026
**Target**: Flashbots Research

---

## 1. The Ordering Problem

MEV extraction is a builder discretion problem. In the current PBS landscape, the entity assembling a block decides transaction order. Every mitigation deployed to date operates within this trust boundary:

- **Flashbots Protect** routes transactions through a private mempool, hiding them from public frontrunners. This is effective against external searchers but does nothing to prevent the builder itself from reordering. The guarantee is social: builders who misbehave lose relay access. There is no cryptographic proof that ordering was preserved.

- **MEV-Share** redistributes extracted value back to users via a rebate mechanism. It acknowledges that extraction will happen and attempts to make it less painful. The ordering itself remains opaque.

- **SUAVE** introduces TEE-based privacy for order flow. This is a hardware trust assumption — valid, but orthogonal to temporal verification.

None of these mechanisms answer a simple question: *given two transactions T_a and T_b, can we cryptographically prove which one arrived first?*

Proof-of-Time (PoT) answers this question. Not with trust, not with hardware enclaves, but with physics.

## 2. PoT Architecture

OpenTTT generates a Proof-of-Time anchor in four stages:

**Stage 1: Multi-Source Time Synthesis.** The protocol queries four independent HTTPS time authorities — NIST, Google Public NTP, Cloudflare, and Apple — and computes a median timestamp with uncertainty bounds. All sources use TLS-verified HTTPS, eliminating the MITM vulnerability inherent in plaintext NTP. The four-source median ensures no single authority can bias the result. Measured precision: +/- 10ms under normal network conditions.

**Stage 2: Ed25519 Signing.** The synthesized timestamp, transaction hash, chain ID, and pool address are bound together and signed with an Ed25519 keypair. This produces a non-repudiable PoT anchor — a cryptographic commitment to "this data existed at this time."

**Stage 3: GRG Integrity Pipeline.** The signed payload passes through a multi-layer integrity pipeline that produces erasure-coded shards with forward error correction. The pipeline binds integrity to chain-specific context via HMAC-SHA256, preventing cross-pool replay. If any shard is tampered with, reconstruction fails deterministically.

**Stage 4: On-Chain Anchoring.** The PoT hash is minted as an ERC-1155 token on-chain, creating a permanent, publicly auditable record. All `PoTAnchored` events are indexed via a Graph Protocol subgraph, forming a Certificate Transparency-style log for transaction ordering.

## 3. The Adaptive Switch: Game Theory Without Slashing

PoT does not require slashing, governance votes, or reputation systems. It uses economic self-selection through an adaptive state machine with two modes:

| | Turbo | Full |
|---|---|---|
| **Trigger** | Consistent PoT alignment | Any ordering discrepancy |
| **Verification latency** | ~50ms | ~127ms |
| **Fee adjustment** | 20% discount | Standard rate |
| **Cooldown** | None | Exponential backoff (up to 320 blocks) |

A builder operating honestly — whose transaction ordering matches the physical timestamps — enters Turbo mode automatically. Lower latency means higher throughput means more revenue. A builder who reorders transactions for extraction deviates from the PoT sequence, triggering Full mode. The latency penalty and exponential cooldown make extraction unprofitable at scale. No entity needs to be expelled. Bad actors simply cannot compete on margins.

This is the core insight: **make honesty the profit-maximizing strategy**, and the mechanism enforces itself.

## 4. Empirical Data

OpenTTT is deployed on Base Sepolia with **4,240+ Proof-of-Time records** generated across three independent channels:

- **DEX swap verifications**: 1,852+ PoTs via Uniswap v4 Hook (`TTTHookSimple`)
- **Direct on-chain mints**: 100+ PoTs from operator tooling
- **MCP AI agent calls**: 2,288+ PoTs from autonomous agents using the `@helm-protocol/ttt-mcp` server

A notable empirical finding: the MCP channel generates PoTs **faster** than the on-chain DEX channel. HTTP-based AI agents produce proofs at higher throughput than DEX swaps can settle on-chain — suggesting that autonomous agents may become the dominant consumers of temporal verification infrastructure.

All records are currently in Full mode (testnet baseline — no turbo promotion without mainnet economic incentives). The full dataset is publicly queryable via the [Base Sepolia subgraph](https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0).

The SDK passes 365 tests across 31 suites. The MCP server exposes five tools (`pot_generate`, `pot_verify`, `pot_query`, `pot_stats`, `pot_health`) compatible with Claude Desktop, LangChain, and OpenAI function-calling agents.

## 5. Complementarity with Flashbots

TTT is **not** a replacement for Flashbots. It is a verification layer.

Flashbots Protect provides privacy — hiding order flow from public extraction. PoT provides proof — cryptographic evidence that the ordering was preserved after the builder received it. The relationship is analogous to TLS: encryption (Protect) ensures nobody reads the data in transit; certificate verification (PoT) ensures the endpoint is who it claims to be. You want both.

Concretely: a user submits a transaction through Flashbots Protect (privacy). The builder includes it in a block. PoT independently verifies that the builder's ordering matches the physical arrival sequence. If it does, the builder earns Turbo status. If not, there is now a public, on-chain, cryptographically signed record of the discrepancy.

**Trust, then verify.** This is the missing half of the MEV mitigation stack.

## 6. IETF Standardization

The protocol specification has been submitted as `draft-helmprotocol-tttps-00` (Experimental) to the IETF. The DISPATCH Working Group has been engaged — Shuping Peng (WG co-chair) has responded regarding routing to the appropriate review track. The draft defines tttps:// as an application-layer extension to TLS 1.3 that authenticates temporal origin in addition to identity.

Our position: transaction ordering verification should be an internet standard, not a proprietary feature. The GRG pipeline specification will be made available for independent implementation upon patent grant (3 provisional patents filed).

## 7. Live Testnet Deployment

The first Uniswap V4 test pool is live on Base Sepolia:

- **Pool**: TestTTT/USDC, 0.3% fee tier
- **Pool ID**: `0x901f76c0fca9d171688a530da068756b4b16866170c5ea10519d2a725041527c`
- **Subgraph**: [v0.2.0](https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0)

The pool integrates the `TTTHookSimple` contract, which gates every swap through the PoT verification pipeline. Each swap generates an on-chain `PoTAnchored` event indexed by the subgraph, creating a complete audit trail of temporal ordering for every transaction in the pool.

## 8. Open Questions

Two problems remain unsolved and represent active research directions:

**T3_micro scalability.** The current tiered model defines T3_micro at ~100ms resolution for institutional HFT pipelines. At this granularity, time source network jitter becomes a significant fraction of the measurement window. Can PoT maintain ordering guarantees when the required precision approaches the physical limits of HTTPS round-trip time? This likely requires dedicated time source infrastructure or protocol-level optimizations to the synthesis algorithm.

**Satellite time distribution.** KTSat and similar GEO satellite operators can distribute reference time with sub-microsecond precision via dedicated RF channels. This eliminates the HTTPS network path entirely, changing the trust model from "4 independent web servers" to "1 satellite operator with atomic clock." The tradeoff between precision gain and trust concentration is non-trivial. How should PoT weight satellite-derived timestamps against HTTPS-derived ones in a hybrid model?

---

*OpenTTT is MIT-licensed and deployed on Base Sepolia. SDK: `npm install openttt`. MCP server: `npm install @helm-protocol/ttt-mcp`. GitHub: [github.com/Helm-Protocol/OpenTTT](https://github.com/Helm-Protocol/OpenTTT). IETF draft: `draft-helmprotocol-tttps-00`.*

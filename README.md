<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/TTTPS-Proof--of--Time-00e87a?style=for-the-badge&labelColor=0c0f14">
  <img src="https://img.shields.io/badge/TTTPS-Proof--of--Time-00e87a?style=for-the-badge&labelColor=0c0f14" alt="TTTPS">
</picture>

# OpenTTT — Proof-of-Time SDK

**`draft-helmprotocol-tttps-02`  ·  Rust + TypeScript  ·  IETF 126 BoF target**

[![Tests](https://img.shields.io/badge/tests-99%20passing-00e87a?style=flat-square&logo=rust&logoColor=white&labelColor=0c0f14)](https://github.com/Helm-Protocol/OpenTTT)
[![IETF Draft](https://img.shields.io/badge/IETF-draft--helmprotocol--tttps--02-2d6ef7?style=flat-square&labelColor=0c0f14)](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
[![License](https://img.shields.io/badge/license-Apache--2.0-f5a623?style=flat-square&labelColor=0c0f14)](LICENSE)

```
TLS proves who.   DNSSEC proves what.   Nothing proves when — until now.
```

</div>

---

## What is TTTPS?

**TTTPS** (Trusted Timestamp Protocol) is the missing temporal trust primitive in internet infrastructure.

The **Shannon Gap**: TLS authenticates *identity*, DNSSEC authenticates *content*, but no standard protocol mathematically proves *when* an event occurred. TTTPS closes this gap.

A **Proof-of-Time (PoT)** is a cryptographically verifiable record that a specific event occurred at a specific time, independently verifiable by anyone without trusting the issuer.

```
PoT = GRG_Commitment || Ed25519_Signature || Roughtime_Chain_Digest
    where GRG_Commitment = G(P ‖ D_chain, ctx_id)
          D_chain = SHA-256(k Roughtime attestations)
```

**Theorem 0 (Inflow-to-Proof):** A forged timestamp T′ ≠ T produces GRG_Commitment′ ≠ GRG_Commitment, causing Ed25519 verification to fail. Issuer timestamp manipulation is *mathematically detectable*, not merely procedurally controlled.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Helm-Protocol/Helm  (Private · Issuer)                  │
│                                                          │
│  crates/grg-core/     ← GRG pipeline (IP-protected)    │
│    G_1: Golomb-Rice compression                         │
│    R:   Reed-Solomon GF(2⁸) erasure (Vandermonde)       │
│    G_2: Golay(23,12,7) perfect code  ← d_min=7, t=3   │
│    H:   HMAC-SHA256 context binding                     │
│                                                          │
│  crates/tttps-server/ ← QUIC server (PoC live)         │
│    quinn QUIC/UDP · ALPN: tttps/1 · Port 4433           │
│                                                          │
│  POST /v1/pot/generate  ← GRG + Ed25519 issuance       │
│  POST /v1/pot/verify    ← Gate2 + HMAC + AS update     │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS + QUIC/UDP
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Helm-Protocol/OpenTTT  (Public · Verifier SDK)          │
│                                                          │
│  src/roughtime/                                          │
│    chain.rs          Roughtime chain builder             │
│    pot_crypto.rs     Ed25519 verify + HMAC Gate1        │
│    wire.rs           TLV parser (draft-19 §5)           │
│    adaptive_switch   TURBO/FULL state machine           │
│    quic_transport    §7.2 frame + TLS binding_key       │
│    no_std_verify     IoT / ARM / FPGA verifier          │
│    osnma.rs          OSNMA P-256 (Phase 2)              │
│                                                          │
│  npm: openttt · PyPI: langchain-openttt                 │
│  99 tests · release clean                               │
└──────────────────────────────────────────────────────────┘
```

---

## Verification Pipeline (§4.5)

```
 0  Version + Future-Timestamp check     <1 ns
 1a TLS binding_key verify (§7.1)        ~6 µs   HMAC-SHA256
 1b AEAD early rejection (§9.8)          ~1 µs   ChaCha20-Poly1305
 2  HMAC Gate1 context binding           ~6 µs   16× cheaper than Ed25519
 3  Ed25519 verify (session only, 1×)   ~46 µs   EUF-CMA, ed25519-dalek v2
 4  Recency Gate2 (AdaptiveSwitch)        3 ns   O(1) saturating_sub
 5  Nonce freshness (NonceStore)         ~1 µs   256-bit HashSet
```

After session establishment, per-packet cost = AEAD (~1 µs) + Gate2 (3 ns).  
Ed25519 is **not** repeated per packet.

---

## Tier Structure (§8)

| Tier | ID | Tolerance | Use Case |
|------|----|-----------|----------|
| T0_epoch | 0x0 | 60,000 ms | Epoch ordering |
| T1_block | 0x1 | 2,000 ms | L2 block finality |
| T2_slot | 0x2 | 12,000 ms | L1 slot (Ethereum) |
| T3_micro | 0x3 | 100 ms | High-frequency |
| **T-s1** | **0x4** | **3,000 ms** | **Deep-space / Earth-Moon RTT** |

**T-s1 design:** Earth-Moon one-way = 384,400 km ÷ 299,792 km/s ≈ 1,282 ms. RTT ≈ 2,600 ms. Tolerance 3,000 ms (400 ms headroom). GRG Golay(23,12,7) provides 3-bit error correction per codeword — heritage from Voyager Saturn transmissions (1.0×10⁹ km, 1980).

---

## Quick Start

### Verify a PoT (Rust)

```rust
use openttt::roughtime::{verify_chain_against_pot, PotRecord};

let pot: PotRecord = serde_json::from_str(&pot_json)?;
let chain = build_chain(&["roughtime.int.cfturnstile.com:2002"]).await?;
let result = verify_chain_against_pot(&chain, &pot)?;
// result.gate2_accepted: bool
// result.age_ms: u64
```

### Request a PoT (HTTP)

```bash
curl -X POST https://api.helm-protocol.io/v1/pot/generate \
  -H "Content-Type: application/json" \
  -d '{"ctx_id": "8453:0xYourPool", "tier": 1}'

# Response:
# {
#   "timestamp_ns": 1776163055195440671,
#   "grg_commitment": "29eb57e4242dddc1...",
#   "issuer_sig": "...",
#   "tier": "T1_block"
# }
```

### QUIC PoC Ping-Pong (KTSat)

```bash
# Clone private Helm repo — run server
cargo run -p tttps-server --release --bin tttps-server -- 0.0.0.0:4433

# Client ping-pong test
cargo run -p tttps-server --release --bin tttps-client -- <server-ip>:4433 1
# Tier 1=T1_block, 3=T3_micro, 4=T-s1(Earth-Moon)
```

Live result (measured):
```
│  TTTPS PoT Ping-Pong  ✓ LIVE QUIC              │
│  Status : ok                                    │
│  Tier   : T1_block                              │
│  Commit : 29eb57e4242dddc1b0cd...               │
│  RTT    : 494µs                                 │
│  Gate2  : ✓ ACCEPT                              │
```

---

## GRG Integrity Pipeline (§5)

```
Encode:  Data → [Golomb-Rice G_1] → [Reed-Solomon R] → [Golay(23,12,7) G_2] → [HMAC H] → Shards
Decode:  Shards → [HMAC verify] → [Golay correct] → [RS reconstruct] → [Golomb decompress] → Data
```

| Stage | Algorithm | Property |
|-------|-----------|----------|
| G_1 | Golomb-Rice (m=16) | Timestamp delta compression |
| R | RS GF(2⁸) Vandermonde k=4 n=6 | 33% packet loss tolerance |
| G_2 | **Golay(23,12,7)** | Perfect code · d_min=7 · t=3 · 1.917× bandwidth |
| H | HMAC-SHA256 | Context binding (pool/chain separation) |

**Why G23 not G24:** G23 [23,12,7] is a *perfect binary code* — the Hamming sphere-packing bound is achieved exactly (4096 codewords × 2048 sphere = 2²³). Bandwidth: 1.917× vs G24's 2.000×. At 10¹² nodes, 4.17% bandwidth savings per shard.

---

## Security Properties

| Attack | Defense | Bound |
|--------|---------|-------|
| NTP MITM future +500s | `if ts > now { REJECT }` (§4.5) | Deterministic |
| BGP delay +2,100ms | Gate2 recency (T1_block 2,000ms tol) | Deterministic |
| Sybil 2/4 +600ms | min-max spread > 500ms stratum_tolerance | Deterministic |
| GRG 1-bit commitment flip | HMAC + Ed25519 double-seal (Theorem 0) | P(forge) < 2⁻¹²⁸ |
| Nonce replay (1M test) | NonceStore HashSet — 1M in 127ms | Deterministic |
| Malicious issuer +200s | Roughtime spread detection | 200s >> 500ms tol |
| Cross-session replay | TLS-Exporter binding_key (§7.1, Ekr) | Session-specific |
| AEAD tag tamper | ChaCha20-Poly1305 | P(forge) < 2⁻⁶⁴ |
| QUIC flood (1M streams) | AEAD early reject at ~1µs | 1,000,000/1,000,000 |

P(Byzantine detect) ≥ 1 − 2⁻⁶¹

---

## Transport (§7, QUIC)

TTTPS operates over QUIC with ALPN `tttps/1`.

```
Client                        Tttps Issuer
  |-- QUIC ClientHello ------>|
  |<- ServerHello + PoT cert -|
  |-- PoT Request (stream) -->|  {"ctx_id", "tier", "nonce_hex"}
  |<- PoT Response (stream) --|  {"timestamp_ns", "grg_commitment", "sig"}
  |-- Gate2 verify ---------->|  local, O(1), no GRG internals exposed
```

**TLS binding_key (§7.1, Ekr requirement):**
```
binding_key = TLS-Exporter("EXPORTER-tttps-pot-binding", pot_without_sig, 32)
```
Prevents cross-session PoT replay.

---

## OSNMA Integration (Phase 2)

OSNMA (Open Service Navigation Message Authentication, ESA/EUSPA) provides satellite-based authenticated timing. GSC Initial Service: July 24, 2025.

```rust
let source = OsnmaTimeSource::new(GscPublicKey::PKI_2);
let auth_time = source.get_authenticated_time().await?;
// P-256 signature over Galileo broadcast — provides L0 satellite time anchor
```

Used as an additional Roughtime server in the chain, providing hardware-root-of-trust timing without relying on IP infrastructure.

---

## Test Coverage

```
cargo test --lib  →  99 tests · 0 failed · release clean

adaptive_switch   9/9   TLA+ verified invariants
chain             8/8   Roughtime chain + causal ordering
pot_crypto       10/10  Ed25519 + HMAC Gate1 (real crypto)
wire             12/12  TLV parser (draft-19 §5)
quic_transport   10/10  §7.2 frame + TLS binding_key
no_std_verify    10/10  IoT/ARM/FPGA verifier
osnma             8/8   OSNMA P-256 real verification
integration       7/7   E2E pipeline
adversarial      10/10  Attack scenarios
```

Helm grg-core: 72 tests · 0 failed (G23, RS, GRG pipeline, AEAD, Ed25519, state machine, attack defense)

---

## Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| IETF Draft | `draft-helmprotocol-tttps-02` | BoF target: IETF 126, Vienna, July 2026 |
| Rust SDK | ✅ 99 tests | grg-core + verifier stack |
| QUIC server | ✅ Live PoC | quinn, ALPN tttps/1, RTT ~494µs |
| TypeScript SDK | ✅ npm: `openttt` | |
| OSNMA | ✅ Phase 2 ready | P-256, GSC EUSPA |
| KTSat PoC | 🔄 Pending LOI | GEO satellite broadcast, T-s1 tier |

---

## Ecosystem

```bash
npm install openttt          # TypeScript/JS SDK
pip install langchain-openttt  # LangChain integration
```

MCP registry · ElizaOS plugin · x402 (Circle) integration available.

---

## References

- [IETF Draft](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/) — draft-helmprotocol-tttps-02
- [Roughtime](https://www.rfc-editor.org/rfc/rfc9557.html) — RFC 9557
- [OSNMA](https://www.euspa.europa.eu/european-space/galileo/services/navigation-message-authentication) — ESA/EUSPA
- [s2n-quic](https://github.com/aws/s2n-quic) — AWS QUIC implementation (production target)
- [quinn](https://github.com/quinn-rs/quinn) — Pure Rust QUIC (current PoC)

---

<div align="center">
<sub>
Helm-Protocol/OpenTTT · Apache-2.0 · 
<a href="https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/">draft-helmprotocol-tttps-02</a>
</sub>
</div>

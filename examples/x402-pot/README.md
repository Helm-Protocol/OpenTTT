# x402 + OpenTTT: Proof-of-Time for AI Agent Payments

Inject a PoT attestation into a Coinbase x402 payment header.
Proves *when* a payment was authorized — prevents replay and frontrunning
without any on-chain interaction.

## How it works

```
Payer                              Receiver
  │                                   │
  ├─ generatePoT()                    │
  │   NIST + Apple + Google           │
  │   + Cloudflare → median           │
  │   HMAC-SHA256 signed              │
  │                                   │
  ├─ embed PoT in x402 extra ──────▶  │
  │                                   ├─ verifyPoT()
  │                                   │   · HMAC check
  │                                   │   · Expiry check (default 60 s)
  │                                   │   · Nonce replay check
  │                                   │
  │                        accept ◀───┤ (or reject + reason)
```

x402's `extra` field is `Record<string, unknown>` — PoT slots in with
no protocol changes required.

## Quick Start

```bash
npm install openttt
npx ts-node x402_pot_example.ts
```

## What the demo shows

1. **Normal flow** — payer generates PoT, receiver verifies it → accepted
2. **Replay attack** — same PoT sent again → rejected (nonce already used)
3. **Tamper attack** — timestamp modified → rejected (HMAC mismatch)

## Security properties

| Property | Mechanism |
|---|---|
| Time integrity | HMAC-SHA256 over `timestamp:nonce:expiresAt:sources` |
| Replay prevention | Per-instance nonce cache with 5 min TTL |
| Freshness | `expiresAt` checked on every verify (default 60 s window) |
| Source consensus | Median of NIST / Apple / Google / Cloudflare |

## Production notes

- Use a **shared HMAC secret** between payer and receiver (pass via `hmacSecret` option).
- The default sandbox key is for local testing only.
- `sourceReadings` is not transmitted in the payment header to keep it compact;
  the receiver skips source-divergence checking (HMAC + expiry + nonce suffice).

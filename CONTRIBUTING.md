# Contributing to OpenTTT

Thank you for your interest in contributing to OpenTTT — an open-source Proof-of-Timestamp protocol for AI agents and blockchain infrastructure.

## What is OpenTTT?

OpenTTT provides cryptographically verifiable timestamps (Proof-of-Time / PoT) by fusing multiple independent time sources (NIST, Apple, Cloudflare, Google). It is used in ElizaOS plugins, execution-specs validation hooks, and on-chain temporal attestation.

## Ways to Contribute

| Type | Examples |
|------|---------|
| **Bug fixes** | Cache key misses, signature edge cases |
| **New time sources** | Add new NTP/Roughtime providers |
| **Language bindings** | Python, Rust, Go wrappers |
| **Documentation** | Examples, tutorials, integration guides |
| **Tests** | Edge cases, property-based tests |

## Getting Started

```bash
git clone https://github.com/Helm-Protocol/OpenTTT.git
cd OpenTTT
npm install
npm test        # run full test suite
npm run build   # TypeScript compile
```

### Requirements

- Node.js ≥ 18
- TypeScript ≥ 5.0

## How to Submit a PR

1. **Fork** the repo and create a branch: `git checkout -b fix/your-fix`
2. **Make your change** — keep scope small and focused
3. **Run tests**: `npm test` (all tests must pass)
4. **Open a PR** against `main` — fill in the PR template
5. Wait for review — we aim to respond within **48 hours**

## Issue Labels

| Label | Meaning |
|-------|---------|
| `good first issue` | Self-contained, clear scope — great for newcomers |
| `help wanted` | We'd love external input here |
| `enhancement` | New feature discussion |
| `bug` | Confirmed defect |

## Code Style

- TypeScript strict mode
- No `any` types without justification
- All public functions must have JSDoc
- Prefer explicit error handling over throwing

## Security Issues

Do **not** open a public issue for security vulnerabilities. Email `security@helmprotocol.xyz` or DM on X ([@HelmProtocol](https://x.com/HelmProtocol)).

## Questions?

Open a [GitHub Discussion](https://github.com/Helm-Protocol/OpenTTT/discussions) or ask in the issue thread.

---

*OpenTTT is part of the [Helm Protocol](https://github.com/Helm-Protocol) ecosystem.*

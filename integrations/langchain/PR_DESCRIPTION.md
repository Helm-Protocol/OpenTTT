## community[tool]: TTTPoTTool - Proof-of-Time attestation for agent transactions

### Summary
Adds TTTPoTTool and TTTPoTVerifyTool for generating and verifying
cryptographic temporal attestations on blockchain transactions.

### Motivation
When multiple AI agents compete for the same on-chain resource,
ordering disputes are inevitable. TTT (TLS TimeToken) provides
Byzantine-resistant proof of when a transaction was submitted,
using 4 independent HTTPS time sources.

### Dependencies
- httpx (already in langchain deps)

### Links
- IETF Draft: https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/
- npm: openttt@0.1.3
- GitHub: https://github.com/Helm-Protocol/OpenTTT

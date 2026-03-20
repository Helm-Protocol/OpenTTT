# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in OpenTTT, please report it responsibly.

**Email:** heime.jorgen@proton.me

**Response SLA:**
- Acknowledge: within 24 hours
- Initial assessment: within 72 hours
- Fix timeline: within 90 days (critical issues prioritized)

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

## Scope

The following are in scope for security reports:

- SDK source code (`src/`)
- Smart contracts (`contracts/`)
- Cryptographic implementations (GRG pipeline, PoT, Ed25519 signing)
- Time synthesis and NTP/HTTPS source handling
- EIP-712 signature verification
- Key management (signer abstraction)

## Out of Scope

- Dependencies (report to upstream maintainers)
- Social engineering attacks
- Denial of service via rate limiting (expected behavior)

## Bug Bounty

Bug bounty program via ImmuneFi is planned. Details will be announced when the program launches.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| < 0.1.0 | No        |

## Disclosure Policy

We follow coordinated vulnerability disclosure (CVD). Please do not publicly disclose vulnerabilities before a fix is available.

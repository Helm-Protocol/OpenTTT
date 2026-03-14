# Changelog

## [0.2.0] - 2026-03-14
### Fixed
- CRITICAL: GRG pipeline now actually executes (was bypassed with grgHash=tokenId)
- CRITICAL: HTTPS time sources replace plaintext NTP (MITM protection)
- CRITICAL: node_modules removed from git tracking
- HIGH: KMS DER public key extraction uses proper ASN.1 parser
- HIGH: Dynamic PoT tolerance by stratum (10ms/25ms/50ms)
- HIGH: Contract source code (TTTToken.sol + ProtocolFee.sol) added
### Added
- PoTAnchored event for Certificate Transparency equivalent
- ReplayCache interface for pluggable persistence
- SECURITY.md with coordinated vulnerability disclosure policy
- Vandermonde matrix caching for GRG performance
- Gas estimation for mintTTT()

## [0.1.1] - 2026-03-14
### Security
- HMAC-SHA256 replaces unkeyed SHA-256 in GRG pipeline
- PoT nonce + expiration for anti-replay protection
- Ed25519 issuer signature for non-repudiation (PotSigner)

### Changed
- Renamed `ProofOfTime.signatures` to `sourceReadings` (accuracy)
- Package renamed from `@helm-protocol/ttt-sdk` to `openttt`

## [0.1.0] - 2026-03-14
### Added
- Initial release: TTTClient with Progressive Disclosure (3 levels)
- Adaptive GRG pipeline (Golomb → Reed-Solomon → Golay)
- 4 signer types: PrivateKey, Turnkey, AWS KMS, GCP KMS
- 4 tiers: T0_epoch, T1_block, T2_slot, T3_micro
- Health monitoring with alerts
- Base Mainnet + Base Sepolia network configs
- Sepolia contracts deployed (TTT + ProtocolFee)
- 104 tests passing

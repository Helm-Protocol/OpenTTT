# TTT Smart Contract Deployments

## Ethereum Sepolia v2 (2026-03-14) — 3rd Audit Remediation

| Contract | Address |
|----------|---------|
| TTT (ERC-1155 + AccessControl) | `0x8C633b05b833a476925F7d9818da6E215760F2c7` |
| ProtocolFee (ERC-20 USDC + EIP-712) | `0x5DeB2888904c4f71879b8813352E903992ffECD3` |
| Deployer/Treasury | `0x98603D935b6Ba2472a7cb48308e801F7ab6287f7` |

**Etherscan Links:**
- TTT: https://sepolia.etherscan.io/address/0x8C633b05b833a476925F7d9818da6E215760F2c7
- ProtocolFee: https://sepolia.etherscan.io/address/0x5DeB2888904c4f71879b8813352E903992ffECD3

**Changes from v1 (2026-03-13):**
- TTT.sol: `onlyOwner` → `onlyRole(MINTER_ROLE)` (AccessControl separation)
- ProtocolFee.sol: ETH → ERC-20 USDC, CollectFee EIP-712 typehash, sequential nonce

## Previous Deployment (deprecated)

| Contract | Address | Status |
|----------|---------|--------|
| TTT (ERC-1155) | `0xde357135cA493e59680182CDE9E1c6A4dA400811` | ❌ deprecated |
| ProtocolFee | `0xE289337d3a79b22753BDA03510a8b8E4D1040F21` | ❌ deprecated |

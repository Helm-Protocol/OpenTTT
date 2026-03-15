# TTT Smart Contract Deployments

## Base Sepolia (2026-03-15)

| Contract | Address |
|----------|---------|
| TTT (ERC-1155) | `0xde357135cA493e59680182CDE9E1c6A4dA400811` |
| ProtocolFee (EIP-712) | `0xE289337d3a79b22753BDA03510a8b8E4D1040F21` |
| TTTHookSimple (PoC) | `0x8C633b05b833a476925F7d9818da6E215760F2c7` |
| Deployer/Treasury | `0x98603D935b6Ba2472a7cb48308e801F7ab6287f7` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

**Basescan Links:**
- TTT: https://sepolia.basescan.org/address/0xde357135cA493e59680182CDE9E1c6A4dA400811
- ProtocolFee: https://sepolia.basescan.org/address/0xE289337d3a79b22753BDA03510a8b8E4D1040F21
- TTTHookSimple: https://sepolia.basescan.org/address/0x8C633b05b833a476925F7d9818da6E215760F2c7

## Ethereum Sepolia v3 (2026-03-14) — 4th Audit (PAUSER_ROLE)

| Contract | Address |
|----------|---------|
| TTT (ERC-1155 + MINTER_ROLE + PAUSER_ROLE) | `0x291b83F605F2dA95cf843d4a53983B413ef3B929` |
| ProtocolFee (ERC-20 USDC + EIP-712) | `0x6b39D96741BB4Ce6283F824CC31c2931c75AEe64` |
| Deployer/Treasury | `0x98603D935b6Ba2472a7cb48308e801F7ab6287f7` |

**Etherscan Links:**
- TTT: https://sepolia.etherscan.io/address/0x291b83F605F2dA95cf843d4a53983B413ef3B929
- ProtocolFee: https://sepolia.etherscan.io/address/0x6b39D96741BB4Ce6283F824CC31c2931c75AEe64

**Changes from v1:**
- TTT.sol: Ownable removed → AccessControl (MINTER_ROLE + PAUSER_ROLE)
- ProtocolFee.sol: ETH → ERC-20 USDC, CollectFee EIP-712 typehash, sequential nonce

## Previous Deployments (deprecated)

| Contract | Address | Version | Status |
|----------|---------|---------|--------|
| TTT v2 | `0x8C633b05b833a476925F7d9818da6E215760F2c7` | MINTER_ROLE only | ❌ deprecated |
| ProtocolFee v2 | `0x5DeB2888904c4f71879b8813352E903992ffECD3` | ERC-20+EIP712 | ❌ deprecated |
| TTT v1 | `0xde357135cA493e59680182CDE9E1c6A4dA400811` | onlyOwner | ❌ deprecated |
| ProtocolFee v1 | `0xE289337d3a79b22753BDA03510a8b8E4D1040F21` | ETH+split sig | ❌ deprecated |

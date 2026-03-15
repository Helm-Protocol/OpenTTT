// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestTTT
 * @notice Simple ERC-20 test token for Uniswap V4 pool PoC on Base Sepolia.
 * @dev Our real TTT is ERC-1155 which can't be used directly in V4 pools.
 *      This ERC-20 wrapper allows us to create a TestTTT/USDC pool for
 *      generating swap activity that feeds into TTTHookSimple PoT events.
 */
contract TestTTT is ERC20, Ownable {
    uint8 private constant _DECIMALS = 18;

    constructor() ERC20("Test TLS Time Token", "tTTT") Ownable(msg.sender) {
        // Mint 10M tokens to deployer for initial liquidity + swap testing
        _mint(msg.sender, 10_000_000 * 10 ** _DECIMALS);
    }

    /// @notice Mint additional tokens (owner only, for testnet use)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TTT (TlsTimeToken)
 * @dev TlsTimeToken implementation for managing micropayment ticks.
 * Inherits ERC-1155, ERC1155Supply, AccessControl, ReentrancyGuard, and Pausable from OpenZeppelin.
 * All access control is managed via AccessControl roles (MINTER_ROLE, PAUSER_ROLE).
 */
contract TTT is ERC1155, ERC1155Supply, AccessControl, ReentrancyGuard, Pausable {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    event TTTMinted(address indexed to, uint256 indexed tokenId, uint256 amount);
    event TTTBurned(address indexed from, uint256 indexed tokenId, uint256 amount, uint256 tier);
    event PoTAnchored(uint256 indexed stratum, bytes32 grgHash, bytes32 potHash, uint256 timestamp);

    constructor() ERC1155("https://api.helm.network/ttt/{id}.json") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /**
     * @dev Mint TTT tokens.
     * @param to Recipient address.
     * @param amount Amount to mint.
     * @param grgHash Hash used as token ID.
     */
    function mint(address to, uint256 amount, bytes32 grgHash) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        uint256 tokenId = uint256(grgHash);
        _mint(to, tokenId, amount, "");
        emit TTTMinted(to, tokenId, amount);
        emit PoTAnchored(tokenId, grgHash, keccak256(abi.encodePacked(to, amount)), block.timestamp);
    }

    /**
     * @dev Burn TTT tokens to signal intention.
     * @param amount Amount to burn.
     * @param grgHash Hash used as token ID.
     * @param tier Tier level of the TTT (used for signature compatibility).
     */
    function burn(uint256 amount, bytes32 grgHash, uint256 tier) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        uint256 tokenId = uint256(grgHash);
        _burn(msg.sender, tokenId, amount);
        emit TTTBurned(msg.sender, tokenId, amount, tier);
    }

    /**
     * @dev Standardizing Token ID management for different pools and timestamps.
     * @param chainId The chain ID.
     * @param pool The address of the pool.
     * @param timestamp The timestamp.
     * @param slotIndex The slot index.
     * @return The generated tokenId.
     */
    function getTokenId(uint256 chainId, address pool, uint256 timestamp, uint256 slotIndex) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(chainId, pool, timestamp, slotIndex)));
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Required overrides for ERC1155 and ERC1155Supply
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        virtual
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    // Required override for ERC1155 + AccessControl
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

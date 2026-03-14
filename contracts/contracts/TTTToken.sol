// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TTTToken (TLS Time Token)
 * @dev ERC-20 token for TLS Time Protocol with Hardened Security.
 * TTT = Time + Logic + Sync
 */
contract TTTToken is ERC20, Ownable, Pausable {

    enum ResolutionTier {
        T0_Epoch, // $0.001/block
        T1_Block, // $0.01/block
        T2_Slot,  // $0.24/block
        T3_Micro  // Micro-resolution tier
    }

    struct TTTRecord {
        uint256 timestamp;
        bytes32 grgHash;      // GRG forward encoding hash (integrity)
        ResolutionTier tier;
        address builder;
    }

    mapping(ResolutionTier => uint256) public tierPrices;
    mapping(uint256 => TTTRecord) public records;
    uint256 public nextRecordId;

    event TTTMinted(address indexed to, uint256 amount, bytes32 grgHash, bytes32 potHash, uint8 stratum);
    event TTTBurned(address indexed from, uint256 amount, uint256 recordId, ResolutionTier tier, uint256 timestamp);
    event PoTAnchored(uint64 indexed timestamp, bytes32 grgHash, uint8 stratum, bytes32 potHash);

    constructor() ERC20("TLS Time Token", "TTT") Ownable(msg.sender) {
        _mint(msg.sender, 10_000_000 * 10**decimals()); // Initial supply 10M

        // Initialize Tier Prices
        tierPrices[ResolutionTier.T0_Epoch] = 1 * 10**decimals() / 1000; // $0.001
        tierPrices[ResolutionTier.T1_Block] = 1 * 10**decimals() / 100;  // $0.01
        tierPrices[ResolutionTier.T2_Slot]  = 24 * 10**decimals() / 100; // $0.24
        tierPrices[ResolutionTier.T3_Micro] = 1 * 10**decimals() / 10000; // $0.0001
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Mint TTT with GRG integrity proof and PoT anchor.
     * @param to Recipient address
     * @param amount Token amount to mint
     * @param grgHash GRG forward encoding hash for data integrity
     * @param potHash Proof of Time hash anchoring the mint to a verified timestamp
     * @param stratum NTP stratum level (0 = satellite, 1 = primary server, etc.)
     */
    function mint(address to, uint256 amount, bytes32 grgHash, bytes32 potHash, uint8 stratum) external onlyOwner whenNotPaused {
        require(grgHash != bytes32(0), "GRG hash cannot be zero");
        require(potHash != bytes32(0), "PoT hash cannot be zero");
        _mint(to, amount);
        emit TTTMinted(to, amount, grgHash, potHash, stratum);
        emit PoTAnchored(uint64(block.timestamp), grgHash, stratum, potHash);
    }

    /**
     * @dev Burn TTT to record a timestamp with Tier validation.
     */
    function burn(uint256 amount, bytes32 grgHash, ResolutionTier tier) external whenNotPaused {
        require(uint8(tier) <= 3, "Invalid resolution tier");
        require(grgHash != bytes32(0), "GRG hash cannot be zero");
        require(amount >= tierPrices[tier], "Amount below tier price");

        _burn(msg.sender, amount);

        records[nextRecordId] = TTTRecord({
            timestamp: block.timestamp,
            grgHash: grgHash,
            tier: tier,
            builder: msg.sender
        });

        emit TTTBurned(msg.sender, amount, nextRecordId, tier, block.timestamp);
        nextRecordId++;
    }

    /**
     * @dev Update tier prices (Owner only).
     */
    function setTierPrice(ResolutionTier tier, uint256 price) external onlyOwner {
        require(uint8(tier) <= 3, "Invalid resolution tier");
        tierPrices[tier] = price;
    }
}

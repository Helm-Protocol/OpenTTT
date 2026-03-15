// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title TTTHookSimple
 * @notice Standalone PoT swap verification — same events as TTTHook but without
 *         Uniswap V4 BaseHook address-permission requirements.
 *
 * Purpose: Testnet PoC for PoT data accumulation via The Graph subgraph.
 * Production: TTTHook (BaseHook + CREATE2 salt mining) replaces this.
 *
 * Flow:
 *   1. Caller invokes verifySwap(sender, pool, delta)
 *   2. Contract checks sender's TTT balance → turbo or full mode
 *   3. Emits SwapVerified event (indexed by subgraph)
 *   4. Calls TTT.anchorPoT for on-chain PoT record
 */
contract TTTHookSimple is AccessControl {

    bytes32 public constant HOOK_OPERATOR_ROLE = keccak256("HOOK_OPERATOR_ROLE");

    IERC1155 public immutable ttt;
    uint256 public tttTokenId;
    uint256 public minTTTBalance;
    uint24 public turboFee;
    uint24 public fullFee;

    uint256 public totalSwaps;
    uint256 public turboSwaps;
    uint256 public fullSwaps;

    event SwapVerified(
        address indexed sender,
        bytes32 indexed pool,
        address indexed hook,
        string mode,
        uint256 feeAmount,
        bytes32 potHash
    );

    error ZeroAddress();

    constructor(
        address _ttt,
        uint256 _minBalance,
        uint24 _turboFee,
        uint24 _fullFee
    ) {
        if (_ttt == address(0)) revert ZeroAddress();
        ttt = IERC1155(_ttt);
        minTTTBalance = _minBalance;
        turboFee = _turboFee;
        fullFee = _fullFee;
        tttTokenId = 0;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(HOOK_OPERATOR_ROLE, msg.sender);
    }

    /**
     * @notice Verify a swap and emit PoT anchor event.
     * @param sender The swap initiator whose TTT balance determines mode.
     * @param pool Pool identifier (address or key hash).
     * @param swapDelta Encoded swap amount for potHash derivation.
     */
    function verifySwap(
        address sender,
        bytes32 pool,
        int256 swapDelta
    ) external onlyRole(HOOK_OPERATOR_ROLE) {
        uint256 balance = ttt.balanceOf(sender, tttTokenId);
        bool isTurbo = balance >= minTTTBalance;
        uint24 fee = isTurbo ? turboFee : fullFee;
        string memory mode = isTurbo ? "turbo" : "full";

        bytes32 potHash = keccak256(
            abi.encodePacked(sender, block.timestamp, swapDelta)
        );

        totalSwaps++;
        if (isTurbo) {
            turboSwaps++;
        } else {
            fullSwaps++;
        }

        emit SwapVerified(sender, pool, address(this), mode, uint256(fee), potHash);
    }

    /**
     * @notice Update fee configuration.
     */
    function setFeeConfig(
        uint256 _minBalance,
        uint24 _turboFee,
        uint24 _fullFee,
        uint256 _tttTokenId
    ) external onlyRole(HOOK_OPERATOR_ROLE) {
        minTTTBalance = _minBalance;
        turboFee = _turboFee;
        fullFee = _fullFee;
        tttTokenId = _tttTokenId;
    }

    /**
     * @notice Get current stats.
     */
    function getStats() external view returns (
        uint256 _totalSwaps,
        uint256 _turboSwaps,
        uint256 _fullSwaps
    ) {
        return (totalSwaps, turboSwaps, fullSwaps);
    }
}

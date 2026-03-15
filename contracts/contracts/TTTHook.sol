// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title TTTHook
 * @notice Uniswap V4 Hook for OpenTTT — adaptive fee based on TTT (ERC-1155) balance.
 *
 * Mechanism (mirrors TTT's turbo/full mode):
 *   - beforeSwap: checks the sender's TTT balance (tokenId=0).
 *     If balance >= minTTTBalance → turbo mode (lower LP fee override).
 *     If balance < minTTTBalance  → full mode  (higher LP fee override).
 *   - afterSwap: emits SwapVerified event and anchors a PoT hash on the TTT contract.
 *
 * The pool MUST be initialized with DYNAMIC_FEE_FLAG (0x800000) for fee overrides to apply.
 *
 * @dev Requires deployment to an address whose lowest 14 bits match the hook permissions
 *      (beforeSwap + afterSwap). Use CREATE2 salt mining for deterministic deployment.
 */
contract TTTHook is BaseHook, AccessControl {
    using LPFeeLibrary for uint24;

    // ─── Roles ───────────────────────────────────────────────────────────
    bytes32 public constant HOOK_OPERATOR_ROLE = keccak256("HOOK_OPERATOR_ROLE");

    // ─── State ───────────────────────────────────────────────────────────

    /// @notice TTT ERC-1155 contract (e.g., deployed on Sepolia at 0x291b83F605F2dA95cf843d4a53983B413ef3B929)
    IERC1155 public immutable ttt;

    /// @notice ERC-1155 tokenId checked for balance (default: 0)
    uint256 public tttTokenId;

    /// @notice Minimum TTT balance required for turbo mode
    uint256 public minTTTBalance;

    /// @notice LP fee (in hundredths of a bip) applied in turbo mode — lower fee
    /// @dev Must include OVERRIDE_FEE_FLAG (0x400000) when returned from beforeSwap
    uint24 public turboFee;

    /// @notice LP fee (in hundredths of a bip) applied in full mode — higher fee
    uint24 public fullFee;

    // ─── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted after each swap with the verification result
    event SwapVerified(
        address indexed sender,
        bool isTurbo,
        uint256 fee,
        bytes32 potHash
    );

    /// @notice Emitted when fee configuration is updated
    event FeeConfigUpdated(
        uint256 minTTTBalance,
        uint24 turboFee,
        uint24 fullFee,
        uint256 tttTokenId
    );

    // ─── Errors ──────────────────────────────────────────────────────────

    error FeeTooLarge(uint24 fee);
    error ZeroAddress();

    // ─── Constructor ─────────────────────────────────────────────────────

    /**
     * @param _manager      Uniswap V4 PoolManager
     * @param _ttt          TTT ERC-1155 contract address
     * @param _minBalance   Minimum TTT balance for turbo mode
     * @param _turboFee     LP fee for turbo mode (hundredths of bip, max 1_000_000)
     * @param _fullFee      LP fee for full mode  (hundredths of bip, max 1_000_000)
     */
    constructor(
        IPoolManager _manager,
        address _ttt,
        uint256 _minBalance,
        uint24 _turboFee,
        uint24 _fullFee
    ) BaseHook(_manager) {
        if (_ttt == address(0)) revert ZeroAddress();
        if (_turboFee > LPFeeLibrary.MAX_LP_FEE) revert FeeTooLarge(_turboFee);
        if (_fullFee > LPFeeLibrary.MAX_LP_FEE) revert FeeTooLarge(_fullFee);

        ttt = IERC1155(_ttt);
        tttTokenId = 0;
        minTTTBalance = _minBalance;
        turboFee = _turboFee;
        fullFee = _fullFee;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(HOOK_OPERATOR_ROLE, msg.sender);
    }

    // ─── Hook Permissions ────────────────────────────────────────────────

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── beforeSwap: Adaptive Fee Selection ──────────────────────────────

    /**
     * @notice Checks sender's TTT balance and returns the appropriate LP fee override.
     * @dev The pool must use DYNAMIC_FEE_FLAG for the fee override to take effect.
     *      The returned fee includes OVERRIDE_FEE_FLAG (bit 22) to signal the PoolManager.
     */
    function _beforeSwap(
        address sender,
        PoolKey calldata, /* key */
        SwapParams calldata, /* params */
        bytes calldata /* hookData */
    ) internal view override returns (bytes4, BeforeSwapDelta, uint24) {
        uint256 balance = ttt.balanceOf(sender, tttTokenId);

        // Select fee based on TTT balance: turbo (low) or full (high)
        uint24 selectedFee = balance >= minTTTBalance ? turboFee : fullFee;

        // Set the OVERRIDE_FEE_FLAG so PoolManager applies this fee
        uint24 feeWithOverride = selectedFee | LPFeeLibrary.OVERRIDE_FEE_FLAG;

        return (
            this.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            feeWithOverride
        );
    }

    // ─── afterSwap: PoT Anchoring & Event Emission ───────────────────────

    /**
     * @notice Emits SwapVerified and anchors a Proof-of-Tick on the TTT contract.
     * @dev The potHash is derived from (sender, block.timestamp, swap delta) for
     *      deterministic on-chain verification. No E8/lattice internals are exposed.
     */
    function _afterSwap(
        address sender,
        PoolKey calldata, /* key */
        SwapParams calldata, /* params */
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        uint256 balance = ttt.balanceOf(sender, tttTokenId);
        bool isTurbo = balance >= minTTTBalance;
        uint24 appliedFee = isTurbo ? turboFee : fullFee;

        // Compute PoT hash: deterministic, no internal secrets exposed
        bytes32 potHash = keccak256(
            abi.encodePacked(sender, block.timestamp, BalanceDelta.unwrap(delta))
        );

        emit SwapVerified(sender, isTurbo, uint256(appliedFee), potHash);

        // Anchor PoT on TTT contract (stratum = current block number)
        // Uses a try/catch so hook execution is never reverted by TTT failures
        bytes32 grgHash = keccak256(abi.encodePacked(sender, block.number));
        try ITTT(address(ttt)).anchorPoT(block.number, grgHash, potHash) {} catch {}

        return (this.afterSwap.selector, 0);
    }

    // ─── Admin: Configuration ────────────────────────────────────────────

    /**
     * @notice Update fee configuration parameters.
     * @param _minBalance  New minimum TTT balance for turbo mode
     * @param _turboFee    New turbo fee (hundredths of bip)
     * @param _fullFee     New full fee (hundredths of bip)
     * @param _tttTokenId  ERC-1155 tokenId to check
     */
    function setFeeConfig(
        uint256 _minBalance,
        uint24 _turboFee,
        uint24 _fullFee,
        uint256 _tttTokenId
    ) external onlyRole(HOOK_OPERATOR_ROLE) {
        if (_turboFee > LPFeeLibrary.MAX_LP_FEE) revert FeeTooLarge(_turboFee);
        if (_fullFee > LPFeeLibrary.MAX_LP_FEE) revert FeeTooLarge(_fullFee);

        minTTTBalance = _minBalance;
        turboFee = _turboFee;
        fullFee = _fullFee;
        tttTokenId = _tttTokenId;

        emit FeeConfigUpdated(_minBalance, _turboFee, _fullFee, _tttTokenId);
    }

    // ─── ERC-165 (AccessControl + IHooks) ────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

// ─── Minimal interface for TTT PoT anchoring ─────────────────────────────
// Only exposes the anchoring function; no E8/lattice internals.
interface ITTT {
    function anchorPoT(uint256 stratum, bytes32 grgHash, bytes32 potHash) external;
}

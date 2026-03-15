// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PoolHelper
 * @notice Minimal helper for interacting with Uniswap V4 PoolManager on testnet.
 * @dev V4 requires all liquidity/swap operations to go through the unlock callback
 *      pattern. This contract implements IUnlockCallback to handle:
 *      1. Adding liquidity (modifyLiquidity)
 *      2. Executing swaps
 *
 *      For testnet PoC only. Production should use Uniswap's PositionManager/V4Router.
 */
contract PoolHelper is IUnlockCallback {
    IPoolManager public immutable poolManager;
    address public immutable owner;

    enum CallbackAction { ADD_LIQUIDITY, SWAP }

    struct AddLiquidityData {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        address sender;
    }

    struct SwapData {
        PoolKey key;
        bool zeroForOne;
        int256 amountSpecified;
        address sender;
    }

    error NotPoolManager();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _poolManager) {
        poolManager = IPoolManager(_poolManager);
        owner = msg.sender;
    }

    // ─── Add Liquidity ───────────────────────────────────────────────

    function addLiquidity(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        int256 liquidityDelta
    ) external onlyOwner returns (BalanceDelta delta) {
        bytes memory result = poolManager.unlock(
            abi.encode(
                CallbackAction.ADD_LIQUIDITY,
                abi.encode(AddLiquidityData({
                    key: key,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: liquidityDelta,
                    sender: msg.sender
                }))
            )
        );
        delta = abi.decode(result, (BalanceDelta));
    }

    // ─── Swap ────────────────────────────────────────────────────────

    function swap(
        PoolKey calldata key,
        bool zeroForOne,
        int256 amountSpecified
    ) external onlyOwner returns (BalanceDelta delta) {
        bytes memory result = poolManager.unlock(
            abi.encode(
                CallbackAction.SWAP,
                abi.encode(SwapData({
                    key: key,
                    zeroForOne: zeroForOne,
                    amountSpecified: amountSpecified,
                    sender: msg.sender
                }))
            )
        );
        delta = abi.decode(result, (BalanceDelta));
    }

    // ─── Unlock Callback ─────────────────────────────────────────────

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (CallbackAction action, bytes memory actionData) = abi.decode(data, (CallbackAction, bytes));

        if (action == CallbackAction.ADD_LIQUIDITY) {
            return _handleAddLiquidity(actionData);
        } else {
            return _handleSwap(actionData);
        }
    }

    function _handleAddLiquidity(bytes memory data) internal returns (bytes memory) {
        AddLiquidityData memory params = abi.decode(data, (AddLiquidityData));

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            params.key,
            ModifyLiquidityParams({
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidityDelta: params.liquidityDelta,
                salt: bytes32(0)
            }),
            bytes("")
        );

        // Settle negative deltas (tokens owed to the pool)
        _settle(params.key.currency0, params.sender, delta.amount0());
        _settle(params.key.currency1, params.sender, delta.amount1());

        // Take positive deltas (tokens owed to sender)
        _take(params.key.currency0, params.sender, delta.amount0());
        _take(params.key.currency1, params.sender, delta.amount1());

        return abi.encode(delta);
    }

    function _handleSwap(bytes memory data) internal returns (bytes memory) {
        SwapData memory params = abi.decode(data, (SwapData));

        uint160 sqrtPriceLimit = params.zeroForOne
            ? TickMath.MIN_SQRT_PRICE + 1
            : TickMath.MAX_SQRT_PRICE - 1;

        BalanceDelta delta = poolManager.swap(
            params.key,
            SwapParams({
                zeroForOne: params.zeroForOne,
                amountSpecified: params.amountSpecified,
                sqrtPriceLimitX96: sqrtPriceLimit
            }),
            bytes("")
        );

        // Settle negative deltas (tokens owed to the pool)
        _settle(params.key.currency0, params.sender, delta.amount0());
        _settle(params.key.currency1, params.sender, delta.amount1());

        // Take positive deltas (tokens owed to sender)
        _take(params.key.currency0, params.sender, delta.amount0());
        _take(params.key.currency1, params.sender, delta.amount1());

        return abi.encode(delta);
    }

    /// @dev If amount is negative, the pool is owed tokens. Transfer them in via sync+settle.
    function _settle(Currency currency, address sender, int128 amount) internal {
        if (amount >= 0) return; // nothing owed
        uint256 amountOwed = uint256(uint128(-amount));

        // Transfer tokens from sender to PoolManager
        address token = Currency.unwrap(currency);
        if (token == address(0)) {
            // Native ETH — caller must have sent value
            poolManager.settle{value: amountOwed}();
        } else {
            // ERC-20: sync snapshots balance, then transfer, then settle computes diff
            poolManager.sync(currency);
            IERC20(token).transferFrom(sender, address(poolManager), amountOwed);
            poolManager.settle();
        }
    }

    /// @dev If amount is positive, the sender is owed tokens. Take them from PoolManager.
    function _take(Currency currency, address sender, int128 amount) internal {
        if (amount <= 0) return; // nothing to take
        uint256 amountToTake = uint256(uint128(amount));
        poolManager.take(currency, sender, amountToTake);
    }
}

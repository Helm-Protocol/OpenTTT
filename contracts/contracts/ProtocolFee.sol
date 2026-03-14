// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title ProtocolFee
 * @dev On-chain fee collection contract with EIP-712 verification.
 */
contract ProtocolFee is Ownable, EIP712, Nonces {
    using SafeERC20 for IERC20;

    address public protocolFeeRecipient;
    bytes32 private constant COLLECT_FEE_TYPEHASH = keccak256("CollectFee(address token,uint256 amount,uint256 nonce,uint256 deadline)");

    event FeeCollected(address indexed payer, uint256 amount, uint256 nonce);

    constructor(address _recipient) Ownable(msg.sender) EIP712("Helm Protocol", "1") {
        protocolFeeRecipient = _recipient;
    }

    /**
     * @dev Sets the treasury address.
     */
    function setProtocolFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "Zero address");
        protocolFeeRecipient = _recipient;
    }

    /**
     * @dev Collects fee from user with EIP-712 signature verification.
     */
    function collectFee(
        address token,
        uint256 amount,
        bytes calldata signature,
        uint256 nonce,
        uint256 deadline
    ) external {
        require(block.timestamp <= deadline, "Deadline exceeded");
        _useCheckedNonce(msg.sender, nonce);

        bytes32 structHash = keccak256(abi.encode(COLLECT_FEE_TYPEHASH, token, amount, nonce, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        require(signer == msg.sender, "Invalid signature");

        IERC20(token).safeTransferFrom(msg.sender, protocolFeeRecipient, amount);

        emit FeeCollected(msg.sender, amount, nonce);
    }
}

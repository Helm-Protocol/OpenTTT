// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProtocolFee
 * @dev EIP-712 signed fee collection for the OpenTTT protocol.
 * Collects protocol fees in ERC-20 tokens (e.g. USDC) with replay protection via sequential nonces.
 */
contract ProtocolFee is EIP712, Ownable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    bytes32 private constant FEE_TYPEHASH =
        keccak256("CollectFee(address token,uint256 amount,uint256 nonce,uint256 deadline)");

    address public feeRecipient;
    mapping(address => uint256) public nonces;

    event FeeCollected(address indexed payer, address indexed token, uint256 amount, uint256 nonce);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    error InvalidSignature();
    error ExpiredDeadline();
    error InsufficientPayment();
    error ZeroAddress();

    constructor(address _feeRecipient) EIP712("OpenTTT_ProtocolFee", "1") Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Zero address");
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Collect a protocol fee with EIP-712 signed authorization.
     * The caller must have approved this contract to spend `amount` of `token`.
     * @param token ERC-20 token address used for fee payment
     * @param amount Fee amount in token units
     * @param signature Compact ECDSA signature (65 bytes)
     * @param nonce Sequential nonce for replay protection (must match sender's current nonce)
     * @param deadline Timestamp after which the signature expires
     */
    function collectFee(
        address token,
        uint256 amount,
        bytes calldata signature,
        uint256 nonce,
        uint256 deadline
    ) external {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (amount == 0) revert InsufficientPayment();
        if (token == address(0)) revert ZeroAddress();

        // Sequential nonce check
        require(nonces[msg.sender] == nonce, "Invalid nonce");

        bytes32 structHash = keccak256(
            abi.encode(FEE_TYPEHASH, token, amount, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != msg.sender) revert InvalidSignature();

        nonces[msg.sender] = nonce + 1;

        // Transfer ERC-20 fee from caller to fee recipient
        IERC20(token).safeTransferFrom(msg.sender, feeRecipient, amount);

        emit FeeCollected(msg.sender, token, amount, nonce);
    }

    /**
     * @dev Update the fee recipient address (Owner only).
     * @param newRecipient New address to receive protocol fees
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address old = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    /**
     * @dev Returns the current nonce for a given payer (for signature construction).
     */
    function getNonce(address payer) external view returns (uint256) {
        return nonces[payer];
    }

    /**
     * @dev Returns the EIP-712 domain separator for off-chain signature construction.
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}

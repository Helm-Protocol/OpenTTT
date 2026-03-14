// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProtocolFee
 * @dev EIP-712 signed fee collection for the OpenTTT protocol.
 * Collects protocol fees with replay protection via nonce tracking.
 */
contract ProtocolFee is EIP712, Ownable {
    using ECDSA for bytes32;

    bytes32 private constant FEE_TYPEHASH =
        keccak256("Fee(address payer,uint256 amount,uint256 nonce,uint256 deadline)");

    address public feeRecipient;
    mapping(address => uint256) public nonces;

    event FeeCollected(address indexed payer, uint256 amount, uint256 nonce);
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
     * @param payer Address paying the fee (must match the signer)
     * @param amount Fee amount in wei
     * @param deadline Timestamp after which the signature expires
     * @param v ECDSA recovery id
     * @param r ECDSA r value
     * @param s ECDSA s value
     */
    function collectFee(
        address payer,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (amount == 0) revert InsufficientPayment();

        uint256 currentNonce = nonces[payer];

        bytes32 structHash = keccak256(
            abi.encode(FEE_TYPEHASH, payer, amount, currentNonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(v, r, s);

        if (signer != payer) revert InvalidSignature();

        nonces[payer] = currentNonce + 1;

        // Transfer fee from caller's msg.value
        (bool sent, ) = feeRecipient.call{value: amount}("");
        require(sent, "Fee transfer failed");

        emit FeeCollected(payer, amount, currentNonce);
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

    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IFeeRecipient {
    function onFeeCollected(uint256 amount) external;
}

/**
 * Core token contract for the experimental economy.
 *
 * The token applies a configurable trade fee and forwards all collected fees to the
 * configured vault, which distributes rewards to locked stakers.
 */
contract ExperimentToken is ERC20, Ownable {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_FEE_BPS = 1_000;

    uint16 public feeBps;
    address public feeRecipient;

    mapping(address => bool) public isFeeExempt;

    event FeeBpsUpdated(uint16 indexed oldBps, uint16 indexed newBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeExemptUpdated(address indexed account, bool isExempt);
    event TransferFeeBurned(
        address indexed sender,
        address indexed recipient,
        uint256 grossAmount,
        uint256 feeAmount
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        address recipient,
        uint16 initialFeeBps
    ) ERC20(tokenName, tokenSymbol) Ownable(msg.sender) {
        require(recipient != address(0), "recipient=zero");
        require(initialFeeBps <= MAX_FEE_BPS, "fee-too-high");

        _mint(msg.sender, initialSupply);
        feeRecipient = recipient;
        feeBps = initialFeeBps;
        isFeeExempt[msg.sender] = true;
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /**
     * Updates the swap fee as basis points.
     */
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "fee-too-high");
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /**
     * Updates the on-chain recipient that receives fee output.
     */
    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "recipient=zero");
        emit FeeRecipientUpdated(feeRecipient, recipient);
        feeRecipient = recipient;
    }

    /**
     * Marks accounts that should not pay transfer fees.
     */
    function setFeeExempt(address account, bool exempt) external onlyOwner {
        isFeeExempt[account] = exempt;
        emit FeeExemptUpdated(account, exempt);
    }

    function _isFeeApplicable(address from, address to) private view returns (bool) {
        if (from == address(0) || to == address(0)) {
            return false;
        }
        if (isFeeExempt[from] || isFeeExempt[to]) {
            return false;
        }
        if (feeRecipient == address(0) || feeBps == 0) {
            return false;
        }
        return true;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (!_isFeeApplicable(from, to)) {
            super._update(from, to, amount);
            return;
        }

        uint256 feeAmount = (amount * feeBps) / BASIS_POINTS;
        uint256 sendAmount = amount - feeAmount;

        if (feeAmount > 0) {
            super._update(from, feeRecipient, feeAmount);
            IFeeRecipient(feeRecipient).onFeeCollected(feeAmount);
        }

        super._update(from, to, sendAmount);
        emit TransferFeeBurned(from, to, amount, feeAmount);
    }
}

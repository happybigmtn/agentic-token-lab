// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ITokenParams {
    function setFeeBps(uint16 newFeeBps) external;
}

interface IVaultParams {
    function setParams(uint256 maxLockDuration, uint256 multiplierCapBps) external;
}

/**
 * Ownable controller that turns one immutable game-theory script into a daily experiment.
 */
contract ExperimentController is Ownable {
    address public token;
    address public vault;
    uint256 public currentEpoch;

    event ExperimentStarted(
        uint256 indexed epoch,
        uint16 swapFeeBps,
        uint256 maxLockDuration,
        uint256 multiplierCapBps,
        string note
    );

    constructor(address token_, address vault_) {
        _transferOwnership(msg.sender);
        require(token_ != address(0), "token=zero");
        require(vault_ != address(0), "vault=zero");
        token = token_;
        vault = vault_;
    }

    function setControllerAddresses(address token_, address vault_) external onlyOwner {
        require(token_ != address(0), "token=zero");
        require(vault_ != address(0), "vault=zero");
        token = token_;
        vault = vault_;
    }

    function startExperiment(
        uint16 swapFeeBps,
        uint256 maxLockDuration,
        uint256 multiplierCapBps,
        string calldata note
    ) external onlyOwner {
        ITokenParams(token).setFeeBps(swapFeeBps);
        IVaultParams(vault).setParams(maxLockDuration, multiplierCapBps);
        currentEpoch += 1;

        emit ExperimentStarted(
            currentEpoch,
            swapFeeBps,
            maxLockDuration,
            multiplierCapBps,
            note
        );
    }
}

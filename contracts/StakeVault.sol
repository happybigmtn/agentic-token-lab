// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Stakes are locked-position only. Rewards are funded by token transfer fees.
 * Each lock gets a linear voting-weight boost up to 12x for 365-day lock.
 */
contract StakeVault is Ownable, ReentrancyGuard {
    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant SCALE = 1e18;

    address public immutable rewardToken;
    uint256 public constant MIN_LOCK_DURATION = 7 days;

    uint256 public maxLockDuration;
    uint256 public multiplierCapBps;
    uint256 public totalLocked;
    uint256 public totalWeight;
    uint256 public rewardPerWeight;
    uint256 public cumulativeRake;

    struct Position {
        uint256 amount;
        uint256 unlocksAt;
        uint256 weight;
        uint256 rewardDebt;
    }

    mapping(address => Position) private positions;
    mapping(address => uint256) public claimableRewards;
    mapping(address => bool) private tracker;

    address[] private stakers;

    event VaultParamsUpdated(uint256 maxLockDuration, uint256 multiplierCapBps);
    event RakeDeposited(uint256 amount);
    event Staked(address indexed staker, uint256 amount, uint256 duration, uint256 weight);
    event Released(address indexed staker, uint256 amount);
    event Claimed(address indexed staker, uint256 amount);

    constructor(
        address token,
        uint256 initialMaxLockDuration,
        uint256 initialMultiplierCapBps
    ) Ownable(msg.sender) {
        require(token != address(0), "token=zero");
        require(initialMaxLockDuration >= MIN_LOCK_DURATION, "lock-too-short");
        require(initialMultiplierCapBps >= BASIS_POINTS, "multiplier-too-low");
        rewardToken = token;
        maxLockDuration = initialMaxLockDuration;
        multiplierCapBps = initialMultiplierCapBps;
    }

    modifier onlyRewardToken() {
        require(msg.sender == rewardToken, "not-reward-token");
        _;
    }

    function onFeeCollected(uint256 amount) external onlyRewardToken nonReentrant {
        _distributeRake(amount);
    }

    function _distributeRake(uint256 amount) private {
        uint256 distributable = amount + cumulativeRake;
        if (distributable == 0) {
            return;
        }

        if (totalWeight == 0) {
            cumulativeRake = distributable;
            return;
        }
        rewardPerWeight += (distributable * SCALE) / totalWeight;
        cumulativeRake = 0;
        emit RakeDeposited(distributable);
    }

    function setParams(uint256 newMaxLockDuration, uint256 newMultiplierCapBps) external onlyOwner {
        require(newMaxLockDuration >= MIN_LOCK_DURATION, "lock-too-short");
        require(newMultiplierCapBps >= BASIS_POINTS, "multiplier-too-low");
        maxLockDuration = newMaxLockDuration;
        multiplierCapBps = newMultiplierCapBps;
        emit VaultParamsUpdated(newMaxLockDuration, newMultiplierCapBps);
    }

    function _weightFromLock(uint256 amount, uint256 lockDuration) private view returns (uint256) {
        uint256 lockedDuration = lockDuration > maxLockDuration ? maxLockDuration : lockDuration;
        uint256 boostBps = BASIS_POINTS
            + ((multiplierCapBps - BASIS_POINTS) * lockedDuration) / maxLockDuration;
        return (amount * boostBps) / BASIS_POINTS;
    }

    function stake(uint256 amount, uint256 lockDuration) external nonReentrant {
        require(amount > 0, "zero-amount");
        require(lockDuration >= MIN_LOCK_DURATION, "lock-too-short");
        require(lockDuration <= maxLockDuration, "lock-too-long");

        Position storage position = positions[msg.sender];
        require(position.amount == 0 || block.timestamp >= position.unlocksAt, "already-staked");

        _harvest(msg.sender);
        _distributeRake(0);

        IERC20(rewardToken).transferFrom(msg.sender, address(this), amount);

        uint256 unlocksAt = block.timestamp + lockDuration;
        uint256 weight = _weightFromLock(amount, lockDuration);

        position.amount = amount;
        position.unlocksAt = unlocksAt;
        position.weight = weight;
        position.rewardDebt = (weight * rewardPerWeight) / SCALE;

        totalLocked += amount;
        totalWeight += weight;
        _track(msg.sender);

        emit Staked(msg.sender, amount, lockDuration, weight);
    }

    function releaseStake() external nonReentrant {
        Position storage position = positions[msg.sender];
        require(position.amount > 0, "no-stake");
        require(block.timestamp >= position.unlocksAt, "locked");

        _harvest(msg.sender);

        uint256 principal = position.amount;
        uint256 reward = claimableRewards[msg.sender];

        totalLocked -= principal;
        totalWeight -= position.weight;

        delete positions[msg.sender];
        claimableRewards[msg.sender] = 0;
        _untrack(msg.sender);

        IERC20(rewardToken).transfer(msg.sender, principal + reward);
        emit Released(msg.sender, principal);
        emit Claimed(msg.sender, reward);
    }

    function claim() external nonReentrant {
        _harvest(msg.sender);
        uint256 reward = claimableRewards[msg.sender];
        require(reward > 0, "nothing-to-claim");
        claimableRewards[msg.sender] = 0;
        IERC20(rewardToken).transfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }

    function _harvest(address staker) private {
        Position storage position = positions[staker];
        if (position.weight == 0) {
            return;
        }
        uint256 accrued = (position.weight * rewardPerWeight) / SCALE;
        if (accrued > position.rewardDebt) {
            claimableRewards[staker] += accrued - position.rewardDebt;
            position.rewardDebt = accrued;
        }
    }

    function getStake(address staker)
        external
        view
        returns (uint256 amount, uint256 unlocksAt, uint256 weight, uint256 rewardDebt)
    {
        Position memory position = positions[staker];
        amount = position.amount;
        unlocksAt = position.unlocksAt;
        weight = position.weight;
        rewardDebt = position.rewardDebt;
    }

    function pendingRewards(address staker) external view returns (uint256) {
        Position memory position = positions[staker];
        uint256 accrued = (position.weight * rewardPerWeight) / SCALE;
        if (accrued <= position.rewardDebt) {
            return claimableRewards[staker];
        }
        return claimableRewards[staker] + (accrued - position.rewardDebt);
    }

    function _track(address staker) private {
        if (!tracker[staker]) {
            stakers.push(staker);
            tracker[staker] = true;
        }
    }

    function _untrack(address staker) private {
        if (!tracker[staker]) {
            return;
        }
        uint256 lastIndex = stakers.length - 1;
        for (uint256 i = 0; i <= lastIndex; i++) {
            if (stakers[i] == staker) {
                stakers[i] = stakers[lastIndex];
                stakers.pop();
                tracker[staker] = false;
                return;
            }
        }
    }

    function getLeaderboard(uint256 limit)
        external
        view
        returns (address[] memory participants, uint256[] memory weights, uint256 count)
    {
        uint256 maxEntries = stakers.length < limit ? stakers.length : limit;
        participants = new address[](maxEntries);
        weights = new uint256[](maxEntries);

        for (uint256 i = 0; i < stakers.length; i++) {
            address candidate = stakers[i];
            uint256 weight = positions[candidate].weight;
            if (weight == 0) {
                continue;
            }
            count = _insertTop(participants, weights, count, maxEntries, candidate, weight);
            if (count >= maxEntries) {
                count = maxEntries;
            }
        }
    }

    function _insertTop(
        address[] memory ranked,
        uint256[] memory rankedWeights,
        uint256 current,
        uint256 maxEntries,
        address candidate,
        uint256 candidateWeight
    ) private pure returns (uint256) {
        if (maxEntries == 0) {
            return 0;
        }

        if (current < maxEntries) {
            uint256 i = current;
            while (i > 0 && candidateWeight > rankedWeights[i - 1]) {
                ranked[i] = ranked[i - 1];
                rankedWeights[i] = rankedWeights[i - 1];
                i--;
            }
            ranked[i] = candidate;
            rankedWeights[i] = candidateWeight;
            return current + 1;
        }

        if (candidateWeight <= rankedWeights[maxEntries - 1]) {
            return current;
        }

        uint256 insertIndex = maxEntries - 1;
        while (insertIndex > 0 && candidateWeight > rankedWeights[insertIndex - 1]) {
            ranked[insertIndex] = ranked[insertIndex - 1];
            rankedWeights[insertIndex] = rankedWeights[insertIndex - 1];
            insertIndex--;
        }

        ranked[insertIndex] = candidate;
        rankedWeights[insertIndex] = candidateWeight;
        return current;
    }
}

const { ethers } = require("ethers");

const tokenAbi = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function feeRecipient() view returns (address)"
];

const vaultAbi = [
  "function totalLocked() view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function getLeaderboard(uint256 limit) view returns (address[] memory, uint256[] memory, uint256)",
  "function getStake(address staker) view returns (uint256,uint256,uint256,uint256)",
  "function pendingRewards(address staker) view returns (uint256)",
  "function maxLockDuration() view returns (uint256)",
  "function multiplierCapBps() view returns (uint256)"
];

const tokenAddress = process.env.TOKEN_ADDRESS;
const vaultAddress = process.env.VAULT_ADDRESS;
const teamWallet = process.env.TEAM_WALLET;
const rpc = process.env.RPC_URL || "http://127.0.0.1:8545";

function fail(reason) {
  console.error(`MONITOR_FAIL: ${reason}`);
  process.exitCode = 1;
}

function isNonZeroAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address || "") && BigInt(address) !== 0n;
}

async function main() {
  if (!tokenAddress || !vaultAddress) {
    fail("Missing TOKEN_ADDRESS or VAULT_ADDRESS");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const token = new ethers.Contract(tokenAddress, tokenAbi, provider);
  const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
  const block = await provider.getBlock("latest");
  const now = block ? BigInt(block.timestamp) : BigInt(Math.floor(Date.now() / 1000));

  const supply = await token.totalSupply();
  if (supply === 0n) {
    fail("Token supply is zero");
  }

  const totalLocked = await vault.totalLocked();
  const totalWeight = await vault.totalWeight();
  const protocolBalance = await token.balanceOf(vaultAddress);
  if (protocolBalance < totalLocked) {
    fail("Vault balance is lower than total locked");
  }

  if (totalLocked === 0n) {
    fail("No locked liquidity in vault");
  }
  if (totalWeight === 0n) {
    fail("No locked voting weight");
  }

  const [addrs, weights, count] = await vault.getLeaderboard(3);
  if (count === 0n) {
    fail("Leaderboard returned empty");
  }

  const maxLock = await vault.maxLockDuration();
  const cap = await vault.multiplierCapBps();
  if (cap < 120000n) {
    fail("Multiplier cap dropped below 12x");
  }

  if (isNonZeroAddress(teamWallet)) {
    const teamStake = await vault.getStake(teamWallet);
    if (teamStake[0] === 0n) {
      fail("Team wallet has no locked stake");
    }
    if (teamStake[1] <= now) {
      fail("Team lock is no longer active");
    }

    const teamBoostBps = (teamStake[2] * 10_000n) / teamStake[0];
    if (teamBoostBps < 119_000n) {
      fail("Team stake is below 11.9x lock boost");
    }
  }

  console.log("MONITOR_OK", {
    supply: supply.toString(),
    totalLocked: totalLocked.toString(),
    totalWeight: totalWeight.toString(),
    maxLockSeconds: maxLock.toString(),
    multiplierCapBps: cap.toString(),
    topLeaderboard: {
      count: Number(count),
      first: count > 0 ? addrs[0] : ethers.ZeroAddress,
      score: count > 0 ? weights[0].toString() : "0"
    }
  });
}

main().then(() => {
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

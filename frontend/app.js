const query = new URLSearchParams(window.location.search);
const CONFIG = {
  vaultAddress: query.get("vault") || "{{VAULT_ADDRESS}}",
  tokenAddress: query.get("token") || "{{TOKEN_ADDRESS}}",
  rpc: "https://sepolia.base.org"
};
if (query.get("rpc")) {
  CONFIG.rpc = query.get("rpc");
}

const vaultAbi = [
  "function totalLocked() view returns (uint256)",
  "function getLeaderboard(uint256 limit) view returns (address[] memory, uint256[] memory, uint256)",
  "function getStake(address staker) view returns (uint256 amount, uint256 unlocksAt, uint256 weight, uint256 rewardDebt)",
  "function pendingRewards(address staker) view returns (uint256)"
];

const tokenAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

let signer;
let vault;
let token;
let addressText = document.getElementById("positionInfo");
let provider;

async function readContracts() {
  const readProvider = window.ethereum
    ? new ethers.BrowserProvider(window.ethereum)
    : new ethers.JsonRpcProvider(CONFIG.rpc);
  vault = new ethers.Contract(CONFIG.vaultAddress, vaultAbi, readProvider);
  token = new ethers.Contract(CONFIG.tokenAddress, tokenAbi, readProvider);
  provider = readProvider;
}

function parseEtherSafe(value) {
  return Number(ethers.formatUnits(value, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

async function hydrateGlobalStats() {
  const totalLocked = await vault.totalLocked();
  const leaderboard = await vault.getLeaderboard(1);

  document.getElementById("totalLocked").textContent = `${parseEtherSafe(totalLocked)} XLEAD`;
  document.getElementById("protocolBalance").textContent = `${parseEtherSafe(await token.balanceOf(CONFIG.vaultAddress))} XLEAD`; 
  document.getElementById("leaderInfo").textContent = leaderboard[2] > 0n
    ? `${leaderboard[0][0].slice(0, 6)}…${leaderboard[0][0].slice(-4)} • ${parseEtherSafe(leaderboard[1][0])}`
    : "No stakers yet";
}

function renderRows(addresses, weights, count) {
  const rows = document.getElementById("leaderRows");
  if (count === 0n) {
    rows.textContent = "No leaderboard data yet";
    return;
  }

  rows.innerHTML = "";
  for (let i = 0; i < Number(count); i++) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${i + 1}. ${addresses[i].slice(0, 6)}…${addresses[i].slice(-4)}</span><strong>${parseEtherSafe(weights[i])} weight</strong>`;
    rows.appendChild(row);
  }
}

async function hydrateLeaderboard() {
  const [addresses, weights, count] = await vault.getLeaderboard(5);
  renderRows(addresses, weights, count);
}

async function hydratePosition() {
  if (!signer) {
    addressText.textContent = "Connect wallet to view stake data.";
    return;
  }

  if (!provider) {
    await readContracts();
  }
  const account = await signer.getAddress();
  const stake = await vault.getStake(account);
  const pending = await vault.pendingRewards(account);
  const unlocked = Number(stake.unlocksAt);

  addressText.textContent = `Address ${account.slice(0, 8)}…${account.slice(-6)} | ` +
    `amount ${parseEtherSafe(stake.amount)} | unlocked ${new Date(unlocked * 1000).toLocaleString()} | ` +
    `pending ${parseEtherSafe(pending)} XLEAD`;
}

async function hydrate() {
  try {
    if (CONFIG.vaultAddress === "{{VAULT_ADDRESS}}" || CONFIG.tokenAddress === "{{TOKEN_ADDRESS}}") {
      return;
    }
    await readContracts();
    await hydrateGlobalStats();
    await hydrateLeaderboard();
    await hydratePosition();
  } catch (error) {
    console.error(error);
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    window.alert("No wallet found. Install MetaMask.");
    return;
  }

  if (!provider) {
    provider = new ethers.BrowserProvider(window.ethereum);
    vault = new ethers.Contract(CONFIG.vaultAddress, vaultAbi, provider);
    token = new ethers.Contract(CONFIG.tokenAddress, tokenAbi, provider);
  } else {
    // If the current provider is already an RPC provider (for read-only mode),
    // switch to a wallet provider for signing actions.
    provider = new ethers.BrowserProvider(window.ethereum);
    vault = new ethers.Contract(CONFIG.vaultAddress, vaultAbi, provider);
    token = new ethers.Contract(CONFIG.tokenAddress, tokenAbi, provider);
  }

  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  const account = await signer.getAddress();
  document.getElementById("connectButton").textContent = `Connected ${account.slice(0, 6)}...`;
  await hydrate();
}

document.getElementById("connectButton").addEventListener("click", connectWallet);
document.getElementById("refreshButton").addEventListener("click", hydrate);

hydrate();

const { ethers } = require("hardhat");

const TOTAL_SUPPLY = 1000000n * 10n ** 18n;
const TEAM_SHARE_BPS = 5100n;
const BASE_FEE_BPS = 100;
const TEAM_LOCK_SECONDS = 365n * 24n * 60n * 60n;
const MAX_LOCK_SECONDS = 365n * 24n * 60n * 60n;
const MAX_MULTIPLIER_BPS = 120000n;

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const teamWallet = signers[1] || owner;
  const liquidityWallet = signers[2] || owner;

  const tokenFactory = await ethers.getContractFactory("ExperimentToken");
  const vaultFactory = await ethers.getContractFactory("StakeVault");
  const controllerFactory = await ethers.getContractFactory("ExperimentController");

  const token = await tokenFactory.deploy(
    "Experiment Ledger",
    "XLEAD",
    TOTAL_SUPPLY,
    await owner.getAddress(),
    BASE_FEE_BPS
  );

  const vault = await vaultFactory.deploy(
    await token.getAddress(),
    MAX_LOCK_SECONDS,
    MAX_MULTIPLIER_BPS
  );

  const controller = await controllerFactory.deploy(
    await token.getAddress(),
    await vault.getAddress()
  );

  await token.waitForDeployment();
  await vault.waitForDeployment();
  await controller.waitForDeployment();

  await token.connect(owner).setFeeRecipient(await vault.getAddress());
  await token.connect(owner).setFeeExempt(await vault.getAddress(), true);

  const teamAmount = (TOTAL_SUPPLY * TEAM_SHARE_BPS) / 10_000n;
  const tradeableAmount = TOTAL_SUPPLY - teamAmount;

  await token.connect(owner).transfer(teamWallet.address, teamAmount);
  await token.connect(owner).transfer(liquidityWallet.address, tradeableAmount);

  await token.connect(teamWallet).approve(await vault.getAddress(), teamAmount);
  await vault.connect(teamWallet).stake(teamAmount, TEAM_LOCK_SECONDS);

  await controller.connect(owner).startExperiment(
    BASE_FEE_BPS,
    MAX_LOCK_SECONDS,
    MAX_MULTIPLIER_BPS,
    "genesis"
  );

  console.log("DEMO_DEPLOY_COMPLETE", {
    token: await token.getAddress(),
    vault: await vault.getAddress(),
    controller: await controller.getAddress(),
    teamWallet: teamWallet.address,
    liquidityWallet: liquidityWallet.address
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

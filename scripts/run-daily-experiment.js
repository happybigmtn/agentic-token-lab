const { ethers } = require("hardhat");

const lockBuckets = [
  7n * 24n * 60n * 60n,
  30n * 24n * 60n * 60n,
  90n * 24n * 60n * 60n,
  180n * 24n * 60n * 60n,
  365n * 24n * 60n * 60n
];
const feeBuckets = [75, 100, 125, 150];
const MAX_MULTIPLIER_BPS = 120000n;

async function main() {
  const controllerAddress = process.env.CONTROLLER_ADDRESS;
  const note = `auto-${new Date().toISOString().split("T")[0]}`;

  if (!controllerAddress) {
    throw new Error("CONTROLLER_ADDRESS is required");
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock?.timestamp) {
    throw new Error("latest block unavailable");
  }

  const daySeed = BigInt(latestBlock.timestamp);
  const lockIndex = Number(daySeed % BigInt(lockBuckets.length));
  const feeIndex = Number((daySeed / 3600n) % BigInt(feeBuckets.length));
  const lockDuration = lockBuckets[lockIndex];
  const swapFee = feeBuckets[feeIndex];

  const controller = await ethers.getContractAt(
    "ExperimentController",
    controllerAddress
  );

  const tx = await controller.startExperiment(
    swapFee,
    lockDuration,
    MAX_MULTIPLIER_BPS,
    note
  );
  const receipt = await tx.wait();

  console.log("EXPERIMENT_UPDATED", {
    transactionHash: receipt.hash,
    lockDuration: lockDuration.toString(),
    swapFee,
    note
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

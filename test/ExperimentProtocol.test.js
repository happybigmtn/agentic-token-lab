const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("agentic protocol controls", function () {
  const totalSupply = ethers.parseUnits("1000000", 18);
  const teamShareBps = 5100n;
  const oneDay = 24n * 60n * 60n;
  const oneMonth = 30n * oneDay;
  const oneYear = 365n * oneDay;
  const baseFeeBps = 100n;
  const maxMultiplierBps = 120_000n;

  let token;
  let vault;
  let controller;
  let owner;
  let team;
  let alice;
  let bob;

  beforeEach(async function () {
    [owner, team, alice, bob] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("ExperimentToken");
    const vaultFactory = await ethers.getContractFactory("StakeVault");
    const controllerFactory = await ethers.getContractFactory("ExperimentController");

    token = await tokenFactory.deploy(
      "Experiment Ledger",
      "XLEAD",
      totalSupply,
      await owner.getAddress(),
      Number(baseFeeBps)
    );

    vault = await vaultFactory.deploy(
      await token.getAddress(),
      oneYear,
      maxMultiplierBps
    );

    controller = await controllerFactory.deploy(
      await token.getAddress(),
      await vault.getAddress()
    );

    await token.setFeeRecipient(await vault.getAddress());
    await token.setFeeExempt(await vault.getAddress(), true);

    const teamAmount = (totalSupply * teamShareBps) / 10_000n;
    await token.transfer(team.address, teamAmount);
    await token.connect(team).approve(await vault.getAddress(), teamAmount);
    await vault.connect(team).stake(teamAmount, oneYear);
  });

  it("forwards transfer rake into vault and makes it claimable by stakers", async function () {
    const startingTeamBalance = await token.balanceOf(team.address);
    const taxFlow = ethers.parseUnits("1000", 18);
    await token.connect(owner).transfer(alice.address, ethers.parseUnits("2000", 18));

    await token.connect(alice).approve(bob.address, taxFlow);
    await token.connect(alice).transfer(bob.address, taxFlow);

    const expectedFee = (taxFlow * baseFeeBps) / 10_000n;
    const vaultFeeBalance = await vault.pendingRewards(team.address);
    const teamStake = await vault.getStake(team.address);
    const vaultBalance = await token.balanceOf(await vault.getAddress());

    expect(vaultBalance).to.equal(teamStake[0] + expectedFee);
    expect(vaultFeeBalance).to.equal(vaultBalance - teamStake[0]);

    await vault.connect(team).claim();
    expect(await token.balanceOf(team.address)).to.equal(startingTeamBalance + vaultFeeBalance);
    expect(await vault.pendingRewards(team.address)).to.equal(0n);
  });

  it("rewards longer locks with higher weight and leaderboard rank", async function () {
    const aliceAmount = ethers.parseUnits("500", 18);
    const bobAmount = ethers.parseUnits("500", 18);

    await token.transfer(alice.address, aliceAmount);
    await token.transfer(bob.address, bobAmount);

    await token.connect(alice).approve(await vault.getAddress(), aliceAmount);
    await token.connect(bob).approve(await vault.getAddress(), bobAmount);
    await token.setFeeExempt(alice.address, false);
    await token.setFeeExempt(bob.address, false);

    await vault.connect(alice).stake(aliceAmount, oneMonth);
    await vault.connect(bob).stake(bobAmount, oneYear);

    const aliceWeight = (await vault.getStake(alice.address))[2];
    const bobWeight = (await vault.getStake(bob.address))[2];

    expect(bobWeight).to.be.gt(aliceWeight);

    const [, weights, count] = await vault.getLeaderboard(2);
    expect(count).to.equal(2n);
    expect(weights[0]).to.equal(bobWeight);
  });

  it("updates daily experiment parameters atomically from controller", async function () {
    const updatedFee = 125;
    const updatedLock = oneMonth * 4n;
    const updatedMultiplier = 90_000n;

    await controller.startExperiment(
      updatedFee,
      updatedLock,
      updatedMultiplier,
      "test-cycle"
    );

    expect(await token.feeBps()).to.equal(updatedFee);
    expect(await vault.maxLockDuration()).to.equal(updatedLock);
    expect(await vault.multiplierCapBps()).to.equal(updatedMultiplier);
  });
});

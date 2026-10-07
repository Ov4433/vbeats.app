import { expect } from "chai";
import { ethers } from "hardhat";
import type {
  BeatNFT,
  BeatRegistry,
  BeatStaking,
  VouchSBT,
} from "../typechain-types";

describe("BeatStaking — stake-to-lease", function () {
  const fingerprint =
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"; // sha256("test")
  const metadataURI = "https://api.vbeats.app/v1/beats/test-id";
  const day = 24 * 3600;
  const dailyRate = ethers.parseEther("0.4");
  const buyoutPrice = ethers.parseEther("5");

  async function deploy() {
    const [studio, producer, staker, staker2, buyer, platform] =
      await ethers.getSigners();

    const regFactory = await ethers.getContractFactory("BeatRegistry");
    const registry = (await regFactory.deploy()) as unknown as BeatRegistry;

    const nftFactory = await ethers.getContractFactory("BeatNFT");
    const nft = (await nftFactory.deploy(
      await registry.getAddress()
    )) as unknown as BeatNFT;

    const vouchFactory = await ethers.getContractFactory("VouchSBT");
    const vouch = (await vouchFactory.deploy()) as unknown as VouchSBT;

    const stakingFactory = await ethers.getContractFactory("BeatStaking");
    const staking = (await stakingFactory.deploy(
      await registry.getAddress(),
      await vouch.getAddress(),
      platform.address
    )) as unknown as BeatStaking;

    await registry
      .connect(producer)
      .registerBeat(fingerprint, metadataURI, producer.address);
    await nft.connect(producer).mintLease(fingerprint, producer.address, 50);
    await nft.connect(producer).mintExclusive(fingerprint, producer.address);
    await nft
      .connect(producer)
      .setApprovalForAll(await staking.getAddress(), true);

    return { registry, nft, vouch, staking, studio, producer, staker, staker2, buyer, platform };
  }

  async function listed(extra: Record<string, unknown> = {}) {
    const d = await deploy();
    const { nft, staking, producer } = d;
    const listingId = await staking.connect(producer).listStake.staticCall(
      await nft.getAddress(),
      fingerprint,
      1, // licensesPerStake
      10, // licenseDeposit
      dailyRate,
      buyoutPrice,
      30, // maxDays
      { ...extra }
    );
    await staking
      .connect(producer)
      .listStake(
        await nft.getAddress(),
        fingerprint,
        1,
        10,
        dailyRate,
        buyoutPrice,
        30
      );
    return { ...d, listingId };
  }

  async function warpDays(n: number) {
    await ethers.provider.send("evm_increaseTime", [n * day]);
    await ethers.provider.send("evm_mine", []);
  }

  it("splits an un-purchased stake 50% producer / 25% staker / 25% platform", async function () {
    const { staking, vouch, studio, producer, staker, platform, listingId } =
      await listed();
    await vouch.connect(studio).issue(staker.address);

    const stakeValue = dailyRate * 10n; // 4 ETH — divides cleanly
    await expect(staking.connect(staker).stake(listingId, 10, { value: stakeValue }))
      .to.emit(staking, "Staked");

    // Early settlement is blocked.
    await expect(staking.settleExpired(listingId)).to.be.revertedWith(
      "BeatStaking: lease not expired"
    );
    await warpDays(11);

    const prodBefore = await ethers.provider.getBalance(producer.address);
    const platBefore = await ethers.provider.getBalance(platform.address);
    const stakerBefore = await ethers.provider.getBalance(staker.address);
    // Anyone may settle.
    await expect(staking.connect(staker).settleExpired(listingId))
      .to.emit(staking, "StakeSettled")
      .withArgs(1, ethers.parseEther("2"), ethers.parseEther("1"), ethers.parseEther("1"));

    expect(await ethers.provider.getBalance(producer.address)).to.equal(
      prodBefore + ethers.parseEther("2")
    );
    expect(await ethers.provider.getBalance(platform.address)).to.equal(
      platBefore + ethers.parseEther("1")
    );
    // 25% back to the staker.
    expect(await ethers.provider.getBalance(staker.address)).to.be.greaterThan(
      stakerBefore + ethers.parseEther("0.99")
    );
    // Nothing left in the contract.
    expect(
      await ethers.provider.getBalance(await staking.getAddress())
    ).to.equal(0);
  });

  it("buyout mid-lease refunds the staker in full and delivers the exclusive", async function () {
    const { staking, nft, vouch, studio, producer, staker, buyer, listingId } =
      await listed();
    await vouch.connect(studio).issue(staker.address);
    const stakeValue = dailyRate * 10n;
    await staking.connect(staker).stake(listingId, 10, { value: stakeValue });

    const exclusiveId = await nft.exclusiveTokenId(fingerprint);
    const prodBefore = await ethers.provider.getBalance(producer.address);
    const stakerBefore = await ethers.provider.getBalance(staker.address);

    await expect(staking.connect(buyer).buyout(listingId, { value: buyoutPrice }))
      .to.emit(staking, "BoughtOut")
      .withArgs(listingId, buyer.address, buyoutPrice);

    expect(await nft.balanceOf(buyer.address, exclusiveId)).to.equal(1);
    expect(await ethers.provider.getBalance(producer.address)).to.be.greaterThan(
      prodBefore + buyoutPrice - ethers.parseEther("0.01")
    );
    // Full refund of the locked stake.
    expect(await ethers.provider.getBalance(staker.address)).to.be.greaterThan(
      stakerBefore + stakeValue - ethers.parseEther("0.01")
    );
  });

  it("sequential stakes each split 50/25/25 on their own expiry", async function () {
    const { staking, vouch, studio, staker, staker2, listingId } = await listed();
    await vouch.connect(studio).issue(staker.address);
    await vouch.connect(studio).issue(staker2.address);

    // First staker: 4 ETH → 2 producer / 1 back / 1 platform.
    await staking.connect(staker).stake(listingId, 10, { value: dailyRate * 10n });
    await warpDays(11);
    const s1Before = await ethers.provider.getBalance(staker.address);
    await staking.settleExpired(listingId);
    expect(await ethers.provider.getBalance(staker.address)).to.be.greaterThan(
      s1Before + ethers.parseEther("0.99")
    );

    // Second staker, longer lease: 12 ETH → 6 / 3 / 3.
    await staking.connect(staker2).stake(listingId, 30, { value: dailyRate * 30n });
    await warpDays(31);
    const s2Before = await ethers.provider.getBalance(staker2.address);
    await staking.settleExpired(listingId);
    expect(await ethers.provider.getBalance(staker2.address)).to.be.greaterThan(
      s2Before + ethers.parseEther("2.99")
    );

    // Settling twice is blocked.
    await expect(staking.settleExpired(listingId)).to.be.revertedWith(
      "BeatStaking: no active stake"
    );
  });

  it("blocks unverified stakers, wrong payments, and double stakes", async function () {
    const { staking, vouch, studio, staker, listingId } = await listed();
    await expect(
      staking.connect(staker).stake(listingId, 10, { value: dailyRate * 10n })
    ).to.be.revertedWith("BeatStaking: staker not verified");

    await vouch.connect(studio).issue(staker.address);
    await expect(
      staking.connect(staker).stake(listingId, 10, { value: dailyRate * 9n })
    ).to.be.revertedWith("BeatStaking: wrong stake");
    await expect(staking.connect(staker).stake(listingId, 31, { value: dailyRate * 31n })
    ).to.be.revertedWith("BeatStaking: bad day count");

    await staking.connect(staker).stake(listingId, 10, { value: dailyRate * 10n });
    await expect(
      staking.connect(staker).stake(listingId, 5, { value: dailyRate * 5n })
    ).to.be.revertedWith("BeatStaking: already staked");
  });

  it("only the beat owner can list, and can cancel an unstaked listing", async function () {
    const { staking, nft, producer, staker, listingId } = await listed();
    const leaseId = await nft.leaseTokenId(fingerprint);
    const exclusiveId = await nft.exclusiveTokenId(fingerprint);

    await expect(
      staking
        .connect(staker)
        .listStake(await nft.getAddress(), fingerprint, 1, 10, dailyRate, buyoutPrice, 30)
    ).to.be.revertedWith("BeatStaking: not the beat owner");

    await expect(staking.connect(producer).cancelListing(listingId))
      .to.emit(staking, "ListingCancelled");
    expect(await nft.balanceOf(producer.address, leaseId)).to.equal(50);
    expect(await nft.balanceOf(producer.address, exclusiveId)).to.equal(1);
  });
});

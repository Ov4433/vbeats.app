import { expect } from "chai";
import { ethers } from "hardhat";
import type {
  BeatEscrow,
  BeatNFT,
  BeatRegistry,
  BeatShard,
  ShardFactory,
  VouchSBT,
} from "../typechain-types";

describe("Verified lane: VouchSBT + BeatEscrow + BeatShard", function () {
  const fingerprint =
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"; // sha256("test")
  const metadataURI = "https://api.vbeats.app/v1/beats/test-id";
  const price = ethers.parseEther("0.05");

  async function deploy() {
    const [studio, producer, buyer, stranger] = await ethers.getSigners();

    const regFactory = await ethers.getContractFactory("BeatRegistry");
    const registry = (await regFactory.deploy()) as unknown as BeatRegistry;

    const nftFactory = await ethers.getContractFactory("BeatNFT");
    const nft = (await nftFactory.deploy(
      await registry.getAddress()
    )) as unknown as BeatNFT;

    const vouchFactory = await ethers.getContractFactory("VouchSBT");
    const vouch = (await vouchFactory.deploy()) as unknown as VouchSBT;

    const escrowFactory = await ethers.getContractFactory("BeatEscrow");
    const escrow = (await escrowFactory.deploy(
      await vouch.getAddress()
    )) as unknown as BeatEscrow;

    const shardFactoryFactory = await ethers.getContractFactory("ShardFactory");
    const shardFactory =
      (await shardFactoryFactory.deploy()) as unknown as ShardFactory;

    // Producer registers the beat (as the relayer would on upload).
    await registry
      .connect(producer)
      .registerBeat(fingerprint, metadataURI, producer.address);

    return { registry, nft, vouch, escrow, shardFactory, studio, producer, buyer, stranger };
  }

  describe("VouchSBT", function () {
    it("issues one soulbound coin per verified buyer", async function () {
      const { vouch, studio, buyer, stranger } = await deploy();
      await expect(vouch.connect(studio).issue(buyer.address))
        .to.emit(vouch, "Vouched")
        .withArgs(buyer.address, 1);
      expect(await vouch.isVerified(buyer.address)).to.equal(true);
      expect(await vouch.balanceOf(buyer.address)).to.equal(1);
      // One per account.
      await expect(
        vouch.connect(studio).issue(buyer.address)
      ).to.be.revertedWith("VouchSBT: already vouched");
      // Only the studio issues.
      await expect(
        vouch.connect(stranger).issue(stranger.address)
      ).to.be.reverted;
    });

    it("is soulbound: transfers are blocked, revoke works", async function () {
      const { vouch, studio, buyer, stranger } = await deploy();
      await vouch.connect(studio).issue(buyer.address);
      await expect(
        vouch.connect(buyer).transferFrom(buyer.address, stranger.address, 1)
      ).to.be.revertedWith("VouchSBT: soulbound");
      // Studio can revoke on scammer activity.
      await expect(vouch.connect(studio).revoke(buyer.address))
        .to.emit(vouch, "Unvouched")
        .withArgs(buyer.address, 1);
      expect(await vouch.isVerified(buyer.address)).to.equal(false);
      // And re-issue later if cleared.
      await vouch.connect(studio).issue(buyer.address);
      expect(await vouch.isVerified(buyer.address)).to.equal(true);
    });
  });

  describe("BeatEscrow", function () {
    async function listed() {
      const d = await deploy();
      const { nft, escrow, producer } = d;
      const tokenId = await nft.leaseTokenId(fingerprint);
      await nft.connect(producer).mintLease(fingerprint, producer.address, 10);
      await nft
        .connect(producer)
        .setApprovalForAll(await escrow.getAddress(), true);
      const listingId = await escrow
        .connect(producer)
        .list.staticCall(
          await nft.getAddress(),
          tokenId,
          10,
          price,
          fingerprint
        );
      await escrow
        .connect(producer)
        .list(await nft.getAddress(), tokenId, 10, price, fingerprint);
      return { ...d, tokenId, listingId };
    }

    it("settles atomically: NFT -> buyer, ETH -> producer", async function () {
      const { escrow, nft, vouch, studio, producer, buyer, tokenId, listingId } =
        await listed();
      await vouch.connect(studio).issue(buyer.address);
      await expect(escrow.connect(buyer).fund(listingId, { value: price }))
        .to.emit(escrow, "Funded")
        .withArgs(listingId, buyer.address, price);
      const sellerBefore = await ethers.provider.getBalance(producer.address);
      await expect(escrow.settle(listingId))
        .to.emit(escrow, "Settled")
        .withArgs(listingId, buyer.address, producer.address, price);
      expect(await nft.balanceOf(buyer.address, tokenId)).to.equal(10);
      expect(
        await ethers.provider.getBalance(producer.address)
      ).to.be.greaterThan(sellerBefore);
    });

    it("blocks unverified buyers at the reader check", async function () {
      const { escrow, buyer, listingId } = await listed();
      await expect(
        escrow.connect(buyer).fund(listingId, { value: price })
      ).to.be.revertedWith("BeatEscrow: buyer not verified");
    });

    it("rejects wrong payment from a verified buyer", async function () {
      const { escrow, vouch, studio, buyer, listingId } = await listed();
      await vouch.connect(studio).issue(buyer.address);
      await expect(
        escrow.connect(buyer).fund(listingId, { value: price - 1n })
      ).to.be.revertedWith("BeatEscrow: wrong payment");
    });

    it("refuses to settle after the buyer's vouch is revoked", async function () {
      const { escrow, vouch, studio, buyer, listingId } = await listed();
      await vouch.connect(studio).issue(buyer.address);
      await escrow.connect(buyer).fund(listingId, { value: price });
      await vouch.connect(studio).revoke(buyer.address);
      await expect(escrow.settle(listingId)).to.be.revertedWith(
        "BeatEscrow: buyer verification lapsed"
      );
      // Buyer can still unwind and get funds back.
      await expect(escrow.connect(buyer).refund(listingId)).to.emit(
        escrow,
        "Refunded"
      );
    });

    it("lets the seller cancel an unfunded listing", async function () {
      const { escrow, nft, producer, tokenId, listingId } = await listed();
      await expect(escrow.connect(producer).cancel(listingId)).to.emit(
        escrow,
        "Cancelled"
      );
      expect(await nft.balanceOf(producer.address, tokenId)).to.equal(10);
    });

    it("handles the exclusive 1-of-1 through the same lane", async function () {
      const { nft, escrow, vouch, studio, producer, buyer } = await deploy();
      const exclusiveId = await nft.exclusiveTokenId(fingerprint);
      await nft.connect(producer).mintExclusive(fingerprint, producer.address);
      await nft
        .connect(producer)
        .setApprovalForAll(await escrow.getAddress(), true);
      const listingId = await escrow
        .connect(producer)
        .list.staticCall(
          await nft.getAddress(),
          exclusiveId,
          1,
          price,
          fingerprint
        );
      await escrow
        .connect(producer)
        .list(await nft.getAddress(), exclusiveId, 1, price, fingerprint);
      await vouch.connect(studio).issue(buyer.address);
      await escrow.connect(buyer).fund(listingId, { value: price });
      await escrow.settle(listingId);
      expect(await nft.balanceOf(buyer.address, exclusiveId)).to.equal(1);
    });
  });

  describe("BeatShard", function () {
    async function vaulted() {
      const d = await deploy();
      const { nft, shardFactory, producer } = d;
      const tokenId = await nft.leaseTokenId(fingerprint);
      await nft.connect(producer).mintLease(fingerprint, producer.address, 100);
      const vaultAddr = await shardFactory
        .create.staticCall(
          await nft.getAddress(),
          tokenId,
          fingerprint,
          "Midnight Drive Shard",
          "MDSHARD"
        );
      await shardFactory.create(
        await nft.getAddress(),
        tokenId,
        fingerprint,
        "Midnight Drive Shard",
        "MDSHARD"
      );
      const vault = (await ethers.getContractAt(
        "BeatShard",
        vaultAddr
      )) as unknown as BeatShard;
      await nft
        .connect(producer)
        .setApprovalForAll(await vault.getAddress(), true);
      return { ...d, vault, tokenId };
    }

    it("breaks licenses into shards and rebuilds them", async function () {
      const { vault, nft, producer, buyer, tokenId } = await vaulted();
      await expect(vault.connect(producer).wrap(40))
        .to.emit(vault, "Wrapped")
        .withArgs(producer.address, 40, 40);
      expect(await vault.balanceOf(producer.address)).to.equal(40);
      expect(await nft.balanceOf(await vault.getAddress(), tokenId)).to.equal(40);
      // Shards move peer-to-peer like any ERC-20.
      await vault.connect(producer).transfer(buyer.address, 15);
      expect(await vault.balanceOf(buyer.address)).to.equal(15);
      // Burning rebuilds the NFT licenses.
      await expect(vault.connect(buyer).unwrap(15))
        .to.emit(vault, "Unwrapped")
        .withArgs(buyer.address, 15, 15);
      expect(await nft.balanceOf(buyer.address, tokenId)).to.equal(15);
      expect(await vault.balanceOf(buyer.address)).to.equal(0);
    });

    it("keeps one vault per beat: shards never mix", async function () {
      const { nft, shardFactory, tokenId } = await vaulted();
      const other = await shardFactory.create.staticCall(
        await nft.getAddress(),
        tokenId,
        fingerprint,
        "Other",
        "OTHER"
      );
      await shardFactory.create(
        await nft.getAddress(),
        tokenId,
        fingerprint,
        "Other",
        "OTHER"
      );
      const vault2 = (await ethers.getContractAt(
        "BeatShard",
        other
      )) as unknown as BeatShard;
      expect(await vault2.tokenId()).to.equal(tokenId);
      expect(await vault2.fingerprint()).to.equal(fingerprint);
    });
  });
});

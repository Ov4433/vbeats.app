import { expect } from "chai";
import { ethers } from "hardhat";
import type {
  BeatEscrow,
  BeatNFT,
  BeatRegistry,
  BeatShard,
  CollabRegistry,
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

    const collabFactory = await ethers.getContractFactory("CollabRegistry");
    const collab = (await collabFactory.deploy(
      await registry.getAddress()
    )) as unknown as CollabRegistry;

    const escrowFactory = await ethers.getContractFactory("BeatEscrow");
    const escrow = (await escrowFactory.deploy(
      await vouch.getAddress(),
      await collab.getAddress(),
      studio.address,
      500
    )) as unknown as BeatEscrow;

    const shardFactoryFactory = await ethers.getContractFactory("ShardFactory");
    const shardFactory =
      (await shardFactoryFactory.deploy()) as unknown as ShardFactory;

    // Producer registers the beat (as the relayer would on upload).
    await registry
      .connect(producer)
      .registerBeat(fingerprint, metadataURI, producer.address);

    return { registry, nft, vouch, escrow, collab, shardFactory, studio, producer, buyer, stranger };
  }

  const week = 7 * 24 * 3600;

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
          fingerprint,
          week
        );
      await escrow
        .connect(producer)
        .list(await nft.getAddress(), tokenId, 10, price, fingerprint, week);
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

    it("lets the seller reclaim after expiry when a funded deal is stuck", async function () {
      const d = await deploy();
      const { nft, escrow, vouch, studio, producer, buyer } = d;
      const tokenId = await nft.leaseTokenId(fingerprint);
      await nft.connect(producer).mintLease(fingerprint, producer.address, 10);
      await nft
        .connect(producer)
        .setApprovalForAll(await escrow.getAddress(), true);
      const hour = 3600;
      const listingId = await escrow
        .connect(producer)
        .list.staticCall(
          await nft.getAddress(),
          tokenId,
          10,
          price,
          fingerprint,
          hour
        );
      await escrow
        .connect(producer)
        .list(await nft.getAddress(), tokenId, 10, price, fingerprint, hour);
      await vouch.connect(studio).issue(buyer.address);
      await escrow.connect(buyer).fund(listingId, { value: price });
      // Vouch revoked after funding: settle can never run now.
      await vouch.connect(studio).revoke(buyer.address);
      await expect(escrow.settle(listingId)).to.be.revertedWith(
        "BeatEscrow: buyer verification lapsed"
      );
      // Too early to reclaim.
      await expect(
        escrow.connect(producer).reclaim(listingId)
      ).to.be.revertedWith("BeatEscrow: not expired");
      // Past expiry: seller unwinds, buyer is refunded, NFT comes home.
      await ethers.provider.send("evm_increaseTime", [hour + 1]);
      await ethers.provider.send("evm_mine", []);
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await expect(escrow.connect(producer).reclaim(listingId)).to.emit(
        escrow,
        "Reclaimed"
      );
      expect(await nft.balanceOf(producer.address, tokenId)).to.equal(10);
      expect(await ethers.provider.getBalance(buyer.address)).to.be.greaterThan(
        buyerBefore
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
          fingerprint,
          week
        );
      await escrow
        .connect(producer)
        .list(await nft.getAddress(), exclusiveId, 1, price, fingerprint, week);
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

  describe("CollabRegistry + escrow splits", function () {
    const takeFingerprint = ethers.keccak256(ethers.toUtf8Bytes("take-1"));
    const takeMetadataURI = "https://api.vbeats.app/v1/takes/take-1";

    async function collabSetup(open: boolean) {
      const d = await deploy();
      const { registry, collab, producer } = d;
      const rapper = d.stranger;
      // The rapper's vocal take is its own registered fingerprint.
      await registry
        .connect(rapper)
        .registerBeat(takeFingerprint, takeMetadataURI, rapper.address);
      if (open) {
        await collab.connect(producer).setOpenCollabs(fingerprint, true);
      }
      return { ...d, rapper };
    }

    async function listedTake(open: boolean, shareBps: number) {
      const d = await collabSetup(open);
      const { nft, escrow, collab, rapper } = d;
      await collab.connect(rapper).proposeCollab(fingerprint, takeFingerprint, shareBps);
      const tokenId = await nft.leaseTokenId(takeFingerprint);
      await nft.connect(rapper).mintLease(takeFingerprint, rapper.address, 10);
      await nft
        .connect(rapper)
        .setApprovalForAll(await escrow.getAddress(), true);
      const listingId = await escrow
        .connect(rapper)
        .list.staticCall(
          await nft.getAddress(),
          tokenId,
          10,
          price,
          takeFingerprint,
          week
        );
      await escrow
        .connect(rapper)
        .list(await nft.getAddress(), tokenId, 10, price, takeFingerprint, week);
      return { ...d, tokenId, listingId };
    }

    it("keeps the take private until the producer approves", async function () {
      const { collab, rapper, producer } = await collabSetup(false);
      await collab.connect(rapper).proposeCollab(fingerprint, takeFingerprint, 0);
      let terms = await collab.getCollab(takeFingerprint);
      expect(terms.approved).to.equal(false);
      expect(terms.producerShareBps).to.equal(5000); // 50/50 default
      await expect(
        collab.connect(rapper).approveCollab(takeFingerprint)
      ).to.be.revertedWith("CollabRegistry: not the producer");
      await expect(collab.connect(producer).approveCollab(takeFingerprint))
        .to.emit(collab, "CollabApproved")
        .withArgs(takeFingerprint, producer.address);
      terms = await collab.getCollab(takeFingerprint);
      expect(terms.approved).to.equal(true);
    });

    it("goes live instantly on open-collab beats", async function () {
      const { collab, rapper } = await collabSetup(true);
      await expect(
        collab.connect(rapper).proposeCollab(fingerprint, takeFingerprint, 6000)
      )
        .to.emit(collab, "CollabProposed")
        .withArgs(takeFingerprint, fingerprint, rapper.address, 6000, true);
      const terms = await collab.getCollab(takeFingerprint);
      expect(terms.approved).to.equal(true);
      expect(terms.producerShareBps).to.equal(6000);
    });

    it("renegotiates splits only with both sides", async function () {
      const { collab, rapper, producer } = await collabSetup(false);
      await collab.connect(rapper).proposeCollab(fingerprint, takeFingerprint, 0);
      await collab.connect(producer).approveCollab(takeFingerprint);
      // Rapper asks for 40/60.
      await collab.connect(rapper).requestSplit(takeFingerprint, 4000);
      let terms = await collab.getCollab(takeFingerprint);
      expect(terms.producerShareBps).to.equal(5000); // not live yet
      // Proposer can't accept their own request.
      await expect(
        collab.connect(rapper).acceptSplit(takeFingerprint)
      ).to.be.revertedWith("CollabRegistry: proposer cannot accept");
      await expect(collab.connect(producer).acceptSplit(takeFingerprint))
        .to.emit(collab, "SplitUpdated")
        .withArgs(takeFingerprint, 4000);
      terms = await collab.getCollab(takeFingerprint);
      expect(terms.producerShareBps).to.equal(4000);
    });

    it("settles a collab sale: 5% platform fee, then the registered split", async function () {
      const {
        escrow,
        nft,
        vouch,
        studio,
        producer,
        rapper,
        buyer,
        collab,
        tokenId,
        listingId,
      } = await listedTake(false, 0);
      await collab.connect(producer).approveCollab(takeFingerprint);
      await vouch.connect(studio).issue(buyer.address);
      await escrow.connect(buyer).fund(listingId, { value: price });
      const producerBefore = await ethers.provider.getBalance(producer.address);
      const rapperBefore = await ethers.provider.getBalance(rapper.address);
      const treasuryBefore = await ethers.provider.getBalance(studio.address);
      await escrow.settle(listingId);
      expect(await nft.balanceOf(buyer.address, tokenId)).to.equal(10);
      const fee = (price * 500n) / 10000n;
      const remainder = price - fee;
      const producerCut = (remainder * 5000n) / 10000n;
      const rapperCut = remainder - producerCut;
      const tolerance = ethers.parseEther("0.001");
      expect(await ethers.provider.getBalance(studio.address)).to.be.greaterThanOrEqual(
        treasuryBefore + fee - tolerance
      );
      expect(await ethers.provider.getBalance(producer.address)).to.be.greaterThanOrEqual(
        producerBefore + producerCut - tolerance
      );
      expect(await ethers.provider.getBalance(rapper.address)).to.be.greaterThanOrEqual(
        rapperBefore + rapperCut - tolerance
      );
    });

    it("pays the seller in full (minus fee) when there is no approved collab", async function () {
      const { escrow, vouch, studio, rapper, buyer, listingId } = await listedTake(
        false,
        0
      );
      // No approval: the take is not a live collab.
      await vouch.connect(studio).issue(buyer.address);
      await escrow.connect(buyer).fund(listingId, { value: price });
      const rapperBefore = await ethers.provider.getBalance(rapper.address);
      await escrow.settle(listingId);
      const fee = (price * 500n) / 10000n;
      expect(await ethers.provider.getBalance(rapper.address)).to.be.greaterThanOrEqual(
        rapperBefore + (price - fee) - ethers.parseEther("0.001")
      );
    });
  });
});

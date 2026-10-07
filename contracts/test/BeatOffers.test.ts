import { expect } from "chai";
import { ethers } from "hardhat";
import type {
  BeatNFT,
  BeatOffers,
  BeatRegistry,
  VouchSBT,
} from "../typechain-types";

describe("BeatOffers — buyers send offers", function () {
  const fingerprint =
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"; // sha256("test")
  const metadataURI = "https://api.vbeats.app/v1/beats/test-id";
  const day = 24 * 3600;
  const offerPrice = ethers.parseEther("1.5");

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

    const offersFactory = await ethers.getContractFactory("BeatOffers");
    const offers = (await offersFactory.deploy(
      await registry.getAddress(),
      await vouch.getAddress()
    )) as unknown as BeatOffers;

    await registry
      .connect(producer)
      .registerBeat(fingerprint, metadataURI, producer.address);
    await nft.connect(producer).mintLease(fingerprint, producer.address, 50);
    await nft.connect(producer).mintExclusive(fingerprint, producer.address);
    // Producer approves the offers contract to pull licenses on acceptance.
    await nft
      .connect(producer)
      .setApprovalForAll(await offers.getAddress(), true);

    return { registry, nft, vouch, offers, studio, producer, buyer, stranger };
  }

  async function leaseOffered() {
    const d = await deploy();
    const { nft, offers, vouch, studio, buyer } = d;
    await vouch.connect(studio).issue(buyer.address);
    const offerId = await offers
      .connect(buyer)
      .makeOffer.staticCall(
        await nft.getAddress(),
        fingerprint,
        false,
        5,
        7 * day,
        { value: offerPrice }
      );
    await offers
      .connect(buyer)
      .makeOffer(await nft.getAddress(), fingerprint, false, 5, 7 * day, {
        value: offerPrice,
      });
    return { ...d, offerId };
  }

  async function warpDays(n: number) {
    await ethers.provider.send("evm_increaseTime", [n * day]);
    await ethers.provider.send("evm_mine", []);
  }

  it("locks an offer and swaps atomically on acceptance", async function () {
    const { nft, offers, producer, buyer, offerId } = await leaseOffered();
    const leaseId = await nft.leaseTokenId(fingerprint);

    // ETH is locked in the contract.
    expect(await ethers.provider.getBalance(await offers.getAddress())).to.equal(
      offerPrice
    );

    const prodBefore = await ethers.provider.getBalance(producer.address);
    await expect(offers.connect(producer).acceptOffer(offerId))
      .to.emit(offers, "OfferAccepted")
      .withArgs(offerId, producer.address, offerPrice);

    expect(await nft.balanceOf(buyer.address, leaseId)).to.equal(5);
    expect(await ethers.provider.getBalance(producer.address)).to.be.greaterThan(
      prodBefore + offerPrice - ethers.parseEther("0.01")
    );
    expect(
      await ethers.provider.getBalance(await offers.getAddress())
    ).to.equal(0);
  });

  it("handles an offer on the exclusive 1-of-1", async function () {
    const { nft, offers, vouch, studio, producer, buyer } = await deploy();
    await vouch.connect(studio).issue(buyer.address);
    const exclusiveId = await nft.exclusiveTokenId(fingerprint);

    const offerId = await offers
      .connect(buyer)
      .makeOffer.staticCall(
        await nft.getAddress(),
        fingerprint,
        true,
        1,
        7 * day,
        { value: offerPrice }
      );
    await offers
      .connect(buyer)
      .makeOffer(await nft.getAddress(), fingerprint, true, 1, 7 * day, {
        value: offerPrice,
      });

    await offers.connect(producer).acceptOffer(offerId);
    expect(await nft.balanceOf(buyer.address, exclusiveId)).to.equal(1);
  });

  it("lets the buyer cancel for a full refund", async function () {
    const { offers, buyer, offerId } = await leaseOffered();
    const before = await ethers.provider.getBalance(buyer.address);
    await expect(offers.connect(buyer).cancelOffer(offerId)).to.emit(
      offers,
      "OfferCancelled"
    );
    expect(await ethers.provider.getBalance(buyer.address)).to.be.greaterThan(
      before + offerPrice - ethers.parseEther("0.01")
    );
  });

  it("lets the producer reject, refunding the buyer", async function () {
    const { offers, producer, buyer, offerId } = await leaseOffered();
    const before = await ethers.provider.getBalance(buyer.address);
    await expect(offers.connect(producer).rejectOffer(offerId)).to.emit(
      offers,
      "OfferRejected"
    );
    expect(await ethers.provider.getBalance(buyer.address)).to.be.greaterThan(
      before + offerPrice - ethers.parseEther("0.01")
    );
  });

  it("expires offers: buyer reclaims, late acceptance fails", async function () {
    const { offers, producer, buyer, offerId } = await leaseOffered();
    await expect(
      offers.connect(buyer).reclaimExpired(offerId)
    ).to.be.revertedWith("BeatOffers: not expired");

    await warpDays(8);
    await expect(
      offers.connect(producer).acceptOffer(offerId)
    ).to.be.revertedWith("BeatOffers: expired");

    const before = await ethers.provider.getBalance(buyer.address);
    await expect(offers.connect(buyer).reclaimExpired(offerId)).to.emit(
      offers,
      "OfferExpired"
    );
    expect(await ethers.provider.getBalance(buyer.address)).to.be.greaterThan(
      before + offerPrice - ethers.parseEther("0.01")
    );
  });

  it("blocks unverified buyers and non-owner acceptance", async function () {
    // Unverified buyer can't even make an offer.
    {
      const d = await deploy();
      await expect(
        d.offers
          .connect(d.buyer)
          .makeOffer(await d.nft.getAddress(), fingerprint, false, 5, 7 * day, {
            value: offerPrice,
          })
      ).to.be.revertedWith("BeatOffers: buyer not verified");
    }

    const { offers, producer, stranger, offerId } = await leaseOffered();
    await expect(
      offers.connect(stranger).acceptOffer(offerId)
    ).to.be.revertedWith("BeatOffers: not the beat owner");
    await expect(
      offers.connect(stranger).rejectOffer(offerId)
    ).to.be.revertedWith("BeatOffers: not the beat owner");
    // Double-accept is blocked.
    await offers.connect(producer).acceptOffer(offerId);
    await expect(
      offers.connect(producer).acceptOffer(offerId)
    ).to.be.revertedWith("BeatOffers: inactive");
  });

  it("negotiates: producer counters, buyer tops up, deal closes at the ask", async function () {
    const { nft, offers, vouch, studio, producer, buyer } = await deploy();
    await vouch.connect(studio).issue(buyer.address);
    const leaseId = await nft.leaseTokenId(fingerprint);
    const nftAddr = await nft.getAddress();

    // Buyer opens at 1 ETH for 5 leases.
    const bid = ethers.parseEther("1");
    const offerId = await offers
      .connect(buyer)
      .makeOffer.staticCall(nftAddr, fingerprint, false, 5, 7 * day, { value: bid });
    await offers
      .connect(buyer)
      .makeOffer(nftAddr, fingerprint, false, 5, 7 * day, { value: bid });

    // Producer counters at 2 ETH — back to the buyer.
    const ask = ethers.parseEther("2");
    await expect(offers.connect(producer).counterOffer(offerId, ask))
      .to.emit(offers, "AskPlaced")
      .withArgs(offerId, ask);

    // Buyer meets the ask with a 1 ETH top-up.
    const prodBefore = await ethers.provider.getBalance(producer.address);
    await expect(offers.connect(buyer).acceptAsk(offerId, { value: ask - bid }))
      .to.emit(offers, "OfferAccepted")
      .withArgs(offerId, producer.address, ask);
    expect(await nft.balanceOf(buyer.address, leaseId)).to.equal(5);
    expect(await ethers.provider.getBalance(producer.address)).to.be.greaterThan(
      prodBefore + ask - ethers.parseEther("0.01")
    );
  });

  it("producer countering at or below the bid executes immediately with refund", async function () {
    const { nft, offers, vouch, studio, producer, buyer } = await deploy();
    await vouch.connect(studio).issue(buyer.address);
    const leaseId = await nft.leaseTokenId(fingerprint);
    const nftAddr = await nft.getAddress();

    const bid = ethers.parseEther("1.5");
    const offerId = await offers
      .connect(buyer)
      .makeOffer.staticCall(nftAddr, fingerprint, false, 5, 7 * day, { value: bid });
    await offers
      .connect(buyer)
      .makeOffer(nftAddr, fingerprint, false, 5, 7 * day, { value: bid });

    // Producer: "I'll take 1." — deal done on the spot, 0.5 refunded.
    const ask = ethers.parseEther("1");
    const buyerBefore = await ethers.provider.getBalance(buyer.address);
    await expect(offers.connect(producer).counterOffer(offerId, ask))
      .to.emit(offers, "OfferAccepted")
      .withArgs(offerId, producer.address, ask);
    expect(await nft.balanceOf(buyer.address, leaseId)).to.equal(5);
    expect(await ethers.provider.getBalance(buyer.address)).to.be.greaterThan(
      buyerBefore + (bid - ask) - ethers.parseEther("0.01")
    );
  });

  it("buyer raises and lowers the bid; producer accepts the latest", async function () {
    const { offers, producer, buyer, offerId } = await leaseOffered(); // 1.5 ETH bid

    await expect(offers.connect(buyer).raiseOffer(offerId, { value: ethers.parseEther("0.5") }))
      .to.emit(offers, "BidUpdated")
      .withArgs(offerId, ethers.parseEther("2"));
    await expect(offers.connect(buyer).lowerOffer(offerId, ethers.parseEther("1.2")))
      .to.emit(offers, "BidUpdated")
      .withArgs(offerId, ethers.parseEther("1.2"));

    const prodBefore = await ethers.provider.getBalance(producer.address);
    await offers.connect(producer).acceptOffer(offerId);
    expect(await ethers.provider.getBalance(producer.address)).to.be.greaterThan(
      prodBefore + ethers.parseEther("1.2") - ethers.parseEther("0.01")
    );
  });

  it("ask can be withdrawn and replaced mid-negotiation", async function () {
    const { offers, producer, buyer, offerId } = await leaseOffered(); // 1.5 ETH bid

    await offers.connect(producer).counterOffer(offerId, ethers.parseEther("3"));
    await expect(offers.connect(producer).withdrawAsk(offerId))
      .to.emit(offers, "AskWithdrawn")
      .withArgs(offerId);

    // New ask at 2 ETH; buyer tops up 0.5 and closes.
    await offers.connect(producer).counterOffer(offerId, ethers.parseEther("2"));
    await expect(offers.connect(buyer).acceptAsk(offerId, { value: ethers.parseEther("0.5") }))
      .to.emit(offers, "OfferAccepted");
  });

  it("rejects zero-value and out-of-range offers", async function () {
    const { nft, offers, vouch, studio, buyer } = await deploy();
    await vouch.connect(studio).issue(buyer.address);
    const nftAddr = await nft.getAddress();
    await expect(
      offers.connect(buyer).makeOffer(nftAddr, fingerprint, false, 5, 7 * day, {
        value: 0,
      })
    ).to.be.revertedWith("BeatOffers: zero offer");
    await expect(
      offers
        .connect(buyer)
        .makeOffer(nftAddr, fingerprint, false, 5, 30 * 60, { value: offerPrice })
    ).to.be.revertedWith("BeatOffers: bad duration");
    await expect(
      offers
        .connect(buyer)
        .makeOffer(nftAddr, fingerprint, true, 5, 7 * day, { value: offerPrice })
    ).to.be.revertedWith("BeatOffers: exclusive is 1-of-1");
  });
});

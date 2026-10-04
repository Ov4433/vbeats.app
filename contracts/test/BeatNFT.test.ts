import { expect } from "chai";
import { ethers } from "hardhat";
import type { BeatNFT, BeatRegistry } from "../typechain-types";

describe("BeatNFT", function () {
  const fingerprint =
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"; // sha256("test")
  const tokenId = BigInt(fingerprint);
  const metadataURI = "https://api.vbeats.app/v1/beats/test-id";

  async function deploy() {
    const [producer, buyer, stranger] = await ethers.getSigners();
    const regFactory = await ethers.getContractFactory("BeatRegistry");
    const registry = (await regFactory.deploy()) as unknown as BeatRegistry;
    const nftFactory = await ethers.getContractFactory("BeatNFT");
    const nft = (await nftFactory.deploy(
      await registry.getAddress()
    )) as unknown as BeatNFT;
    // Producer registers the beat (as the relayer would on upload).
    await registry
      .connect(producer)
      .registerBeat(fingerprint, metadataURI, producer.address);
    return { registry, nft, producer, buyer, stranger };
  }

  it("mints lease editions for the beat owner only", async function () {
    const { nft, producer, stranger } = await deploy();
    await expect(nft.connect(producer).mintLease(fingerprint, producer.address, 100))
      .to.emit(nft, "LicenseMinted")
      .withArgs(fingerprint, producer.address, 100, false);
    expect(await nft.balanceOf(producer.address, tokenId)).to.equal(100);
    await expect(
      nft.connect(stranger).mintLease(fingerprint, stranger.address, 1)
    ).to.be.revertedWith("BeatNFT: not the beat owner");
  });

  it("mints the exclusive 1-of-1 exactly once, on its own token id", async function () {
    const { nft, producer } = await deploy();
    const exclusiveId = await nft.exclusiveTokenId(fingerprint);
    const leaseId = await nft.leaseTokenId(fingerprint);
    expect(exclusiveId).to.not.equal(leaseId);
    await nft.connect(producer).mintExclusive(fingerprint, producer.address);
    expect(await nft.balanceOf(producer.address, exclusiveId)).to.equal(1);
    expect(await nft.balanceOf(producer.address, leaseId)).to.equal(0);
    expect(await nft.exclusiveMinted(fingerprint)).to.equal(true);
    await expect(
      nft.connect(producer).mintExclusive(fingerprint, producer.address)
    ).to.be.revertedWith("BeatNFT: exclusive already minted");
  });

  it("serves metadata from the registry entry for both license types", async function () {
    const { nft, producer } = await deploy();
    const leaseId = await nft.leaseTokenId(fingerprint);
    const exclusiveId = await nft.exclusiveTokenId(fingerprint);
    await nft.connect(producer).mintLease(fingerprint, producer.address, 1);
    await nft.connect(producer).mintExclusive(fingerprint, producer.address);
    expect(await nft.uri(leaseId)).to.equal(metadataURI);
    expect(await nft.uri(exclusiveId)).to.equal(metadataURI);
  });

  it("pays 10% royalty to the producer", async function () {
    const { nft, producer } = await deploy();
    await nft.connect(producer).mintLease(fingerprint, producer.address, 1);
    const [receiver, amount] = await nft.royaltyInfo(tokenId, 10000);
    expect(receiver).to.equal(producer.address);
    expect(amount).to.equal(1000);
  });

  it("lists and sells licenses for ETH", async function () {
    const { nft, producer, buyer } = await deploy();
    const price = ethers.parseEther("0.05");
    await nft.connect(producer).mintLease(fingerprint, producer.address, 10);
    await nft.connect(producer).stockForSale(fingerprint, false, 10);
    await nft.connect(producer).setPrice(fingerprint, false, price);

    const before = await ethers.provider.getBalance(producer.address);
    await expect(nft.connect(buyer).buy(fingerprint, false, 2, { value: price * 2n }))
      .to.emit(nft, "LicenseBought")
      .withArgs(fingerprint, false, buyer.address, 2, price * 2n);
    expect(await nft.balanceOf(buyer.address, tokenId)).to.equal(2);
    const after = await ethers.provider.getBalance(producer.address);
    expect(after - before).to.equal(price * 2n);

    await expect(
      nft.connect(buyer).buy(fingerprint, false, 1, { value: price / 2n })
    ).to.be.revertedWith("BeatNFT: wrong payment");
  });

  it("refuses minting for unregistered beats", async function () {
    const { nft, producer } = await deploy();
    const unknown =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await expect(
      nft.connect(producer).mintLease(unknown, producer.address, 1)
    ).to.be.revertedWith("BeatNFT: beat not registered");
  });
});

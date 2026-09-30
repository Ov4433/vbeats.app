import { expect } from "chai";
import { ethers } from "hardhat";
import type { BeatRegistry } from "../typechain-types";

describe("BeatRegistry", function () {
  const fingerprint =
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"; // sha256("test")
  const metadataURI = "https://api.vbeats.app/v1/beats/test-id";

  async function deploy() {
    const [owner, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("BeatRegistry");
    const registry = (await factory.deploy()) as unknown as BeatRegistry;
    return { registry, owner, other };
  }

  it("starts unregistered", async function () {
    const { registry } = await deploy();
    expect(await registry.isRegistered(fingerprint)).to.equal(false);
    const beat = await registry.getBeat(fingerprint);
    expect(beat.owner).to.equal(ethers.ZeroAddress);
  });

  it("registers a beat and emits BeatRegistered", async function () {
    const { registry, owner } = await deploy();
    await expect(registry.registerBeat(fingerprint, metadataURI))
      .to.emit(registry, "BeatRegistered")
      .withArgs(fingerprint, owner.address, metadataURI);
    expect(await registry.isRegistered(fingerprint)).to.equal(true);
    const beat = await registry.getBeat(fingerprint);
    expect(beat.owner).to.equal(owner.address);
    expect(beat.metadataURI).to.equal(metadataURI);
    expect(beat.timestamp).to.be.gt(0);
  });

  it("rejects double registration", async function () {
    const { registry } = await deploy();
    await registry.registerBeat(fingerprint, metadataURI);
    await expect(
      registry.registerBeat(fingerprint, metadataURI)
    ).to.be.revertedWith("BeatRegistry: already registered");
  });

  it("transfers ownership and emits BeatTransferred", async function () {
    const { registry, owner, other } = await deploy();
    await registry.registerBeat(fingerprint, metadataURI);
    await expect(registry.transferBeat(fingerprint, other.address))
      .to.emit(registry, "BeatTransferred")
      .withArgs(fingerprint, owner.address, other.address);
    const beat = await registry.getBeat(fingerprint);
    expect(beat.owner).to.equal(other.address);
  });

  it("rejects transfer by non-owner", async function () {
    const { registry, other } = await deploy();
    await registry.registerBeat(fingerprint, metadataURI);
    await expect(
      registry.connect(other).transferBeat(fingerprint, other.address)
    ).to.be.revertedWith("BeatRegistry: not the owner");
  });
});

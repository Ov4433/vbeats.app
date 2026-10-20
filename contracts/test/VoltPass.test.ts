import { expect } from "chai";
import { ethers } from "hardhat";
import type { VoltPass } from "../typechain-types";

describe("VoltPass", function () {
  const PRICE = ethers.parseEther("0.005");

  async function deploy() {
    const [owner, producer, relayer, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VoltPass");
    const pass = (await factory.deploy(
      relayer.address
    )) as unknown as VoltPass;
    await pass.connect(owner).setPublicMintOpen(true);
    return { pass, owner, producer, relayer, stranger };
  }

  it("mints a pass for exactly 0.005 ETH and gates uploads by holder", async function () {
    const { pass, producer, stranger } = await deploy();
    await expect(pass.connect(producer).mint({ value: PRICE }))
      .to.emit(pass, "PassMinted")
      .withArgs(producer.address, 1, false);
    expect(await pass.hasPass(producer.address)).to.equal(true);
    expect(await pass.hasPass(stranger.address)).to.equal(false);
    expect(await pass.passOf(producer.address)).to.equal(1);
    await expect(
      pass.connect(stranger).mint({ value: 0 })
    ).to.be.revertedWith("VoltPass: wrong price");
  });

  it("is soulbound: transfers revert, burns stay possible", async function () {
    const { pass, producer, stranger } = await deploy();
    await pass.connect(producer).mint({ value: PRICE });
    await expect(
      pass.connect(producer).transferFrom(producer.address, stranger.address, 1)
    ).to.be.revertedWith("VoltPass: soulbound");
    await expect(
      pass.connect(producer)["safeTransferFrom(address,address,uint256)"](
        producer.address,
        stranger.address,
        1
      )
    ).to.be.revertedWith("VoltPass: soulbound");
  });

  it("allows one pass per account", async function () {
    const { pass, producer } = await deploy();
    await pass.connect(producer).mint({ value: PRICE });
    await expect(
      pass.connect(producer).mint({ value: PRICE })
    ).to.be.revertedWith("VoltPass: one pass per account");
  });

  it("runs a free wave: first N mints are free, then paid", async function () {
    const { pass, owner, producer, stranger } = await deploy();
    await pass.connect(owner).setFreeWave(1);
    await expect(pass.connect(producer).mint({ value: 0 }))
      .to.emit(pass, "PassMinted")
      .withArgs(producer.address, 1, true);
    await expect(
      pass.connect(stranger).mint({ value: PRICE })
    ).to.emit(pass, "PassMinted");
    // Wave mints must be value-less; the paid lane rejects free value too.
    await expect(
      pass.connect(stranger).mint({ value: 0 })
    ).to.be.revertedWith("VoltPass: one pass per account");
  });

  it("relayer consumes the one free export exactly once", async function () {
    const { pass, owner, producer, relayer, stranger } = await deploy();
    await pass.connect(producer).mint({ value: PRICE });
    await pass.connect(owner).setRelayer(relayer.address);
    expect(await pass.freeMintUsed(1)).to.equal(false);
    await expect(pass.connect(relayer).consumeFreeMint(1))
      .to.emit(pass, "FreeMintConsumed")
      .withArgs(1, relayer.address);
    expect(await pass.freeMintUsed(1)).to.equal(true);
    await expect(pass.connect(relayer).consumeFreeMint(1)).to.be.revertedWith(
      "VoltPass: free mint already used"
    );
    await expect(
      pass.connect(stranger).consumeFreeMint(1)
    ).to.be.revertedWith("VoltPass: not relayer");
    await expect(pass.connect(relayer).consumeFreeMint(999)).to.be.revertedWith(
      "VoltPass: no such pass"
    );
  });

  it("owner sweeps proceeds to the treasury", async function () {
    const { pass, owner, producer } = await deploy();
    await pass.connect(producer).mint({ value: PRICE });
    await expect(pass.connect(owner).withdraw())
      .to.emit(pass, "Withdrawn")
      .withArgs(owner.address, PRICE);
    expect(await ethers.provider.getBalance(await pass.getAddress())).to.equal(0);
    await expect(pass.connect(producer).withdraw()).to.be.reverted;
  });

  it("caps supply at 1,000", async function () {
    const { pass } = await deploy();
    expect(await pass.MAX_SUPPLY()).to.equal(1000);
    expect(await pass.MINT_PRICE()).to.equal(PRICE);
  });

  it("v2: public mint ships closed until the owner opens it", async function () {
    const [owner, producer, relayer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VoltPass");
    const pass = (await factory.deploy(relayer.address)) as unknown as VoltPass;
    expect(await pass.publicMintOpen()).to.equal(false);
    await expect(
      pass.connect(producer).mint({ value: PRICE })
    ).to.be.revertedWith("VoltPass: public mint closed");
    await pass.connect(owner).setPublicMintOpen(true);
    await expect(pass.connect(producer).mint({ value: PRICE }))
      .to.emit(pass, "PassMinted")
      .withArgs(producer.address, 1, false);
  });

  it("v2: relayer mints claim passes via mintFor, free and gasless for the holder", async function () {
    const { pass, producer, relayer, stranger } = await deploy();
    expect(await pass.relayer()).to.equal(relayer.address);
    await expect(pass.connect(relayer).mintFor(producer.address))
      .to.emit(pass, "PassMinted")
      .withArgs(producer.address, 1, true);
    expect(await pass.hasPass(producer.address)).to.equal(true);
    expect(await pass.totalMinted()).to.equal(1);
    // One per account applies to claim mints too.
    await expect(
      pass.connect(relayer).mintFor(producer.address)
    ).to.be.revertedWith("VoltPass: one pass per account");
    // A stranger cannot mint claims.
    await expect(
      pass.connect(stranger).mintFor(stranger.address)
    ).to.be.revertedWith("VoltPass: not authorized");
    // Claim passes are soulbound like any other.
    await expect(
      pass.connect(producer).transferFrom(producer.address, stranger.address, 1)
    ).to.be.revertedWith("VoltPass: soulbound");
  });

  it("v2: owner can also mintFor (studio-key fallback)", async function () {
    const { pass, owner, producer } = await deploy();
    await expect(pass.connect(owner).mintFor(producer.address))
      .to.emit(pass, "PassMinted")
      .withArgs(producer.address, 1, true);
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import type { VoltPass } from "../typechain-types";

describe("VoltPass", function () {
  const PRICE = ethers.parseEther("0.005");

  async function deploy() {
    const [owner, producer, relayer, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VoltPass");
    const pass = (await factory.deploy()) as unknown as VoltPass;
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
});

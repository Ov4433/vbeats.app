import { ethers } from "hardhat";

async function main() {
  const BeatRegistry = await ethers.getContractFactory("BeatRegistry");
  const registry = await BeatRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`BeatRegistry deployed to: ${address}`);
  console.log(
    `Set BEAT_REGISTRY_ADDRESS=${address} in backend/.env to enable on-chain verification.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

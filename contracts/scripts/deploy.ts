import { ethers } from "hardhat";

async function main() {
  const BeatRegistry = await ethers.getContractFactory("BeatRegistry");
  const registry = await BeatRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`BeatRegistry deployed to: ${registryAddress}`);

  const BeatNFT = await ethers.getContractFactory("BeatNFT");
  const nft = await BeatNFT.deploy(registryAddress);
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`BeatNFT deployed to:      ${nftAddress}`);

  console.log(`
Set these in the Render vbeats-api service env (and backend/.env):
  RPC_URL=https://mainnet.base.org
  BEAT_REGISTRY_ADDRESS=${registryAddress}
  BEAT_NFT_ADDRESS=${nftAddress}
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

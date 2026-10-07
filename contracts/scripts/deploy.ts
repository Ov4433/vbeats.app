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

  const VouchSBT = await ethers.getContractFactory("VouchSBT");
  const vouch = await VouchSBT.deploy();
  await vouch.waitForDeployment();
  const vouchAddress = await vouch.getAddress();
  console.log(`VouchSBT deployed to:         ${vouchAddress}`);

  const BeatEscrow = await ethers.getContractFactory("BeatEscrow");
  const escrow = await BeatEscrow.deploy(vouchAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`BeatEscrow deployed to:       ${escrowAddress}`);

  const ShardFactory = await ethers.getContractFactory("ShardFactory");
  const shardFactory = await ShardFactory.deploy();
  await shardFactory.waitForDeployment();
  const shardFactoryAddress = await shardFactory.getAddress();
  console.log(`ShardFactory deployed to:    ${shardFactoryAddress}`);

  console.log(`
Set these in the Render vbeats-api service env (and backend/.env):
  RPC_URL=https://mainnet.base.org
  BEAT_REGISTRY_ADDRESS=${registryAddress}
  BEAT_NFT_ADDRESS=${nftAddress}
  VOUCH_ADDRESS=${vouchAddress}
  BEAT_ESCROW_ADDRESS=${escrowAddress}
  SHARD_FACTORY_ADDRESS=${shardFactoryAddress}
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

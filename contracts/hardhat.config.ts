import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    // Base mainnet: deploy with `npx hardhat run scripts/deploy.ts --network base`
    // DEPLOYER_KEY is the deployer wallet's private key (never commit it).
    base: {
      chainId: 8453,
      url: process.env.RPC_URL || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    // e.g. Base Sepolia for testnet deploys:
    // baseSepolia: {
    //   url: process.env.RPC_URL || "",
    //   accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    // },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;

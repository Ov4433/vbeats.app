// Blockchain Service for VbeatS application
// This module handles Web3 interactions using ethers.js

import { ethers } from 'ethers';

const BLOCKCHAIN_RPC_URL = process.env.REACT_APP_BLOCKCHAIN_RPC_URL || 'https://mainnet.base.org';
const NETWORK_ID = parseInt(process.env.REACT_APP_BLOCKCHAIN_NETWORK_ID || '8453');

let provider: ethers.JsonRpcProvider;

/**
 * Initialize blockchain provider
 */
export function initializeBlockchain() {
  provider = new ethers.JsonRpcProvider(BLOCKCHAIN_RPC_URL);
  return provider;
}

/**
 * Get blockchain provider
 */
export function getProvider() {
  if (!provider) {
    initializeBlockchain();
  }
  return provider;
}

/**
 * Get network information
 */
export async function getNetworkInfo() {
  const network = await getProvider().getNetwork();
  return {
    chainId: network.chainId,
    name: network.name,
    ensAddress: network.ensAddress,
  };
}

/**
 * Verify network connection
 */
export async function verifyNetworkConnection(): Promise<boolean> {
  try {
    const blockNumber = await getProvider().getBlockNumber();
    return blockNumber > 0;
  } catch (error) {
    console.error('Network connection failed:', error);
    return false;
  }
}

/**
 * Get address balance
 */
export async function getAddressBalance(address: string): Promise<string> {
  const balance = await getProvider().getBalance(address);
  return ethers.formatEther(balance);
}

/**
 * Verify wallet signature
 */
export async function verifySignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
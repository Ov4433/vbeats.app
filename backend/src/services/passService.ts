import { ethers } from 'ethers';
import { config } from '../config';

// Volt Pass claim service — the token-gated buy-in (spec:
// volt-pass-drop-spec.md, token-launch-package.md).
//
// Flow: a wallet holds >= PASS_HOLD_THRESHOLD VBEATS on Robinhood Chain
// (checked here over RPC) -> the relayer mints its Volt Pass on Base via
// VoltPass.mintFor (gasless for the claimant) -> the pass tokenId IS the
// member number. Perks (showcase booking) unlock at the member goal.
//
// Everything degrades gracefully: while VBEATS_TOKEN_ADDRESS or
// VOLT_PASS_ADDRESS are unset (pre-launch), reads report configured=false
// and claims refuse with a clear error instead of throwing.

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

const VOLT_PASS_ABI = [
  'function hasPass(address account) view returns (bool)',
  'function passOf(address account) view returns (uint256)',
  'function totalMinted() view returns (uint256)',
  'function mintFor(address to) returns (uint256)',
] as const;

export interface HoldingCheck {
  configured: boolean;
  /** Raw VBEATS balance (smallest units), as a decimal string. */
  balance: string;
  /** Human-readable balance (decimals applied). */
  balanceFormatted: string;
  /** Human-readable threshold, e.g. "10". */
  threshold: string;
  eligible: boolean;
}

export interface PassStatus {
  configured: boolean;
  members: number;
  memberGoal: number;
  showcaseUnlocked: boolean;
  supplyCap: number;
  threshold: string;
  tokenAddress: string;
  passAddress: string;
}

let cachedDecimals: number | null = null;

function rhcProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rhcRpcUrl);
}

function baseProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

export function passConfigured(): boolean {
  return Boolean(
    config.vbeatsTokenAddress &&
      ethers.isAddress(config.vbeatsTokenAddress) &&
      config.voltPassAddress &&
      ethers.isAddress(config.voltPassAddress) &&
      config.rpcUrl
  );
}

async function tokenDecimals(): Promise<number> {
  if (cachedDecimals !== null) return cachedDecimals;
  const token = new ethers.Contract(
    config.vbeatsTokenAddress,
    ERC20_ABI,
    rhcProvider()
  );
  cachedDecimals = Number(await token.decimals());
  return cachedDecimals;
}

/** Read a wallet's VBEATS balance on Robinhood Chain and compare to the
 * claim threshold. Never throws for config problems; RPC failures throw
 * so the route can answer 502. */
export async function checkHolding(address: string): Promise<HoldingCheck> {
  const thresholdHuman = config.passHoldThreshold;
  if (!config.vbeatsTokenAddress || !ethers.isAddress(config.vbeatsTokenAddress)) {
    return {
      configured: false,
      balance: '0',
      balanceFormatted: '0',
      threshold: thresholdHuman,
      eligible: false,
    };
  }
  const decimals = await tokenDecimals();
  const token = new ethers.Contract(
    config.vbeatsTokenAddress,
    ERC20_ABI,
    rhcProvider()
  );
  const raw: bigint = await token.balanceOf(address);
  const thresholdRaw = ethers.parseUnits(thresholdHuman, decimals);
  return {
    configured: true,
    balance: raw.toString(),
    balanceFormatted: ethers.formatUnits(raw, decimals),
    threshold: thresholdHuman,
    eligible: raw >= thresholdRaw,
  };
}

/** On-chain pass state for one wallet (Base). */
export async function getPassState(
  address: string
): Promise<{ hasPass: boolean; tokenId: number | null }> {
  if (!config.voltPassAddress || !config.rpcUrl) {
    return { hasPass: false, tokenId: null };
  }
  const pass = new ethers.Contract(
    config.voltPassAddress,
    VOLT_PASS_ABI,
    baseProvider()
  );
  const id: bigint = await pass.passOf(address);
  return id > 0n
    ? { hasPass: true, tokenId: Number(id) }
    : { hasPass: false, tokenId: null };
}

/** Total passes minted on-chain (the member count's ground truth). */
export async function getOnChainMemberCount(): Promise<number | null> {
  if (!config.voltPassAddress || !config.rpcUrl) return null;
  try {
    const pass = new ethers.Contract(
      config.voltPassAddress,
      VOLT_PASS_ABI,
      baseProvider()
    );
    return Number(await pass.totalMinted());
  } catch {
    return null;
  }
}

/** Mint a claim pass to `address` via the relayer. Caller must have
 * already verified eligibility. Returns the pass tokenId (= member #)
 * and the mint tx hash. Throws on chain failure. */
export async function mintClaimPass(
  address: string
): Promise<{ tokenId: number; txHash: string }> {
  if (!config.relayerKey) {
    throw new Error('relayer not configured');
  }
  const provider = baseProvider();
  const wallet = new ethers.Wallet(config.relayerKey, provider);
  const pass = new ethers.Contract(
    config.voltPassAddress,
    VOLT_PASS_ABI,
    wallet
  );
  const existing: bigint = await pass.passOf(address);
  if (existing > 0n) {
    return { tokenId: Number(existing), txHash: '' };
  }
  const tx = (await pass.mintFor(address)) as { hash: string; wait: () => Promise<unknown> };
  await tx.wait();
  const id: bigint = await pass.passOf(address);
  return { tokenId: Number(id), txHash: tx.hash };
}

export function buildStatus(members: number): PassStatus {
  return {
    configured: passConfigured(),
    members,
    memberGoal: config.showcaseMemberGoal,
    showcaseUnlocked: members >= config.showcaseMemberGoal,
    supplyCap: 1000,
    threshold: config.passHoldThreshold,
    tokenAddress: config.vbeatsTokenAddress,
    passAddress: config.voltPassAddress,
  };
}

import { ethers } from 'ethers';
import { config } from '../config';

// Minimal ABI for the BeatRegistry contract (read-only calls only).
const BEAT_REGISTRY_ABI = [
  'function isRegistered(bytes32 fingerprint) view returns (bool)',
  'function getBeat(bytes32 fingerprint) view returns (address owner, uint256 timestamp, string metadataURI)',
] as const;

export interface ChainCheck {
  /** False when RPC_URL / BEAT_REGISTRY_ADDRESS are not configured. */
  configured: boolean;
  onChain: boolean;
  owner?: string;
  registeredAt?: string;
}

function normalizeFingerprint(fp: string): string | null {
  const hex = fp.startsWith('0x') ? fp : `0x${fp}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

/**
 * Read-only check: is this SHA-256 fingerprint registered in BeatRegistry?
 * Never needs a private key. Returns configured=false when the RPC/contract
 * env vars are missing so callers can degrade gracefully.
 */
export async function checkFingerprintOnChain(
  fingerprint: string | null
): Promise<ChainCheck> {
  if (!config.rpcUrl || !config.beatRegistryAddress || !fingerprint) {
    return { configured: false, onChain: false };
  }
  const fp = normalizeFingerprint(fingerprint);
  if (!fp) {
    return { configured: true, onChain: false };
  }
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.beatRegistryAddress,
      BEAT_REGISTRY_ABI,
      provider
    );
    const onChain = (await contract.isRegistered(fp)) as boolean;
    if (!onChain) {
      return { configured: true, onChain: false };
    }
    const beat = (await contract.getBeat(fp)) as {
      owner: string;
      timestamp: bigint;
    };
    return {
      configured: true,
      onChain: true,
      owner: beat.owner,
      registeredAt: new Date(Number(beat.timestamp) * 1000).toISOString(),
    };
  } catch (err) {
    console.warn('[chain] on-chain check failed:', (err as Error).message);
    return { configured: true, onChain: false };
  }
}

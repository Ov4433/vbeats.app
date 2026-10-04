import { ethers } from 'ethers';
import { config } from '../config';

// Minimal ABI for the BeatRegistry contract.
const BEAT_REGISTRY_ABI = [
  'function isRegistered(bytes32 fingerprint) view returns (bool)',
  'function getBeat(bytes32 fingerprint) view returns (address owner, uint256 timestamp, string metadataURI)',
  'function registerBeat(bytes32 fingerprint, string calldata metadataURI, address producer) external',
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
 * Relayer write: register a beat fingerprint on-chain at upload time.
 * Only runs when RELAYER_KEY is set (backend-held relayer wallet, funded
 * with Base ETH for gas). Never throws — callers fire-and-forget this so a
 * chain hiccup can never fail an upload. Returns the tx hash or null.
 *
 * The producer's address is recorded as the on-chain owner, not the
 * relayer. When no producer address is supplied we skip the write
 * entirely — registering a wrong owner on-chain is worse than not
 * registering.
 */
export async function registerBeatOnChain(
  fingerprint: string,
  metadataURI: string,
  producerAddress?: string
): Promise<string | null> {
  if (!config.relayerKey) {
    return null; // relayer not configured — user-signing flow or off
  }
  if (!config.rpcUrl || !config.beatRegistryAddress) {
    console.warn('[chain] relayer set but RPC_URL/BEAT_REGISTRY_ADDRESS missing; skipping on-chain registration');
    return null;
  }
  const fp = normalizeFingerprint(fingerprint);
  if (!fp) return null;
  if (!producerAddress || !ethers.isAddress(producerAddress)) {
    console.warn('[chain] registerBeat skipped: no valid producer address supplied; not recording the relayer as owner');
    return null;
  }
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.relayerKey, provider);
    const contract = new ethers.Contract(
      config.beatRegistryAddress,
      BEAT_REGISTRY_ABI,
      wallet
    );
    const tx = (await contract.registerBeat(fp, metadataURI, producerAddress)) as { hash: string };
    console.log(`[chain] registerBeat sent: ${tx.hash} (fp ${fp.slice(0, 10)}…, owner ${producerAddress})`);
    return tx.hash;
  } catch (err) {
    console.warn('[chain] registerBeat failed:', (err as Error).message);
    return null;
  }
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

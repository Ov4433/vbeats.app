import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from '../db';

// Solana wallet linking (dev.fun bridge) — proof of ownership by signature.
//
// The user signs ONE server-specified message with their Solana wallet
// (Phantom's signMessage): "Link this Solana wallet to VBeats account
// <userId>". The signature is ed25519 over the UTF-8 message bytes, the
// address is the base58 ed25519 public key. Verification is pure — no
// chain calls, no scraping (dev.fun has no account-link API and its
// profile pages are unreliable; the signature IS the bridge).

/** The exact message a user signs to link a wallet to their account. */
export function buildLinkMessage(userId: string): string {
  return `Link this Solana wallet to VBeats account ${userId}`;
}

export interface SolanaLinkInput {
  address: string;
  /** base58-encoded 64-byte ed25519 signature. */
  signature: string;
  message: string;
}

/**
 * Pure verification: the message must be exactly the server-specified
 * string for THIS user (a signature replayed against another account
 * fails), the address must decode to a 32-byte key, the signature to
 * 64 bytes, and the signature must verify. Never throws.
 */
export function verifyLinkSignature(userId: string, input: SolanaLinkInput): boolean {
  try {
    if (!input || input.message !== buildLinkMessage(userId)) return false;
    const pub = bs58.decode(input.address);
    if (pub.length !== 32) return false;
    const sig = bs58.decode(input.signature);
    if (sig.length !== 64) return false;
    const msg = new TextEncoder().encode(input.message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

export type FindBySolanaAddress = (
  address: string
) => Promise<{ id: string } | null>;

const defaultFindBySolanaAddress: FindBySolanaAddress = async (address) =>
  prisma.user.findUnique({
    where: { solanaAddress: address },
    select: { id: true },
  });

/**
 * An address may be linked to at most one account. Re-linking the same
 * address to the SAME account is fine (idempotent). Solana addresses are
 * case-sensitive (base58), so the lookup is exact.
 */
export async function assertAddressAvailable(
  address: string,
  currentUserId: string,
  find: FindBySolanaAddress = defaultFindBySolanaAddress
): Promise<boolean> {
  const other = await find(address);
  return !other || other.id === currentUserId;
}

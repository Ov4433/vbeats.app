// Beat Service for VbeatS
// Handles beat creation, upload, and management

import { apiRequest, apiUpload, resolveMediaUrl } from './api';

export interface Beat {
  id: string;
  title: string;
  description?: string;
  genre: string;
  bpm?: number;
  price: number;
  duration: number;
  audioUrl: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  // Optional — the backend may not return these yet. Never assume them:
  // no fingerprint means "Not verified yet", never "✓ VERIFIED", and
  // no plays/votes means trending keeps backend order (never price).
  fingerprint?: string;
  stats?: { plays?: number };
  votes?: { totalWeight?: number };
  // Make-a-song: kind / parent link / co-sign state. The backend may not
  // return these yet — absence means a plain beat, never a song.
  kind?: 'beat' | 'song';
  parentBeatId?: string | null;
  coSignStatus?: 'live' | 'pending' | 'rejected';
  coSignedAt?: string | null;
  // "Co-signed by …": the parent beat producer's username, attached by
  // the backend when the song went live through an accepted feature
  // request. Absent = not co-signed this way.
  coSignedBy?: { id: string; username: string } | null;
  parentBeat?: { id: string; title: string; userId: string } | null;
}

/** Money path (Nov 13): an on-chain license purchase. amount is ETH,
    currency is always 'ETH', txHash is the Basescan receipt. */
export interface Transaction {
  id: string;
  beatId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  type: string;
  status: 'completed' | 'pending' | string;
  txHash?: string | null;
  licenseKind?: string | null;
  createdAt: string;
  beat?: Beat | null;
}

export interface Dashboard {
  beatsCount: number;
  earningsEth: number;
  salesCount: number;
  perBeat: Array<{ beatId: string; title: string; sales: number; eth: number }>;
  purchases: Transaction[];
  pendingOffers: Array<{
    beatId: string; beatTitle: string; offerId: string; bidEth: string;
    buyer: string; expiresAt: string; exclusive: boolean; amount: string;
  }>;
  offersUnavailable: boolean;
  pendingFeatures: number;
  legacySalesCount: number;
}

/**
 * Producer dashboard (money path, Nov 13): real earnings from completed
 * on-chain license sales. 404 = old backend — callers treat that as
 * "not available yet", never as invented numbers.
 */
export async function getDashboard(): Promise<Dashboard> {
  const d = await apiRequest<Dashboard>('/transactions/dashboard', {
    requiresAuth: true,
  });
  return {
    ...d,
    purchases: (d.purchases || []).map((t) => ({
      ...t,
      beat: t.beat ? normalizeBeat(t.beat) : null,
    })),
  };
}

export async function listTransactions(): Promise<Transaction[]> {
  const res = await apiRequest<{ transactions: Transaction[] }>('/transactions', {
    requiresAuth: true,
  });
  return (res.transactions || []).map((t) => ({
    ...t,
    beat: t.beat ? normalizeBeat(t.beat) : null,
  }));
}

/**
 * Record an on-chain license purchase (money path, Nov 13): called right
 * after BeatNFT.buy() mines, with the tx hash as the receipt. The
 * backend checks the receipt on Base when it can; a row it cannot check
 * yet comes back 'pending', never faked as completed.
 */
export async function recordPurchase(
  beatId: string,
  txHash: string,
  amountEth: number,
  licenseKind: 'lease' | 'exclusive'
): Promise<Transaction> {
  return apiRequest<Transaction>('/transactions', {
    method: 'POST',
    body: { beatId, txHash, amountEth, licenseKind },
    requiresAuth: true,
  });
}

export interface FeatureRequest {
  id: string;
  songId: string;
  parentBeatId: string;
  producerId: string;
  requesterId: string;
  status: 'pending' | 'accepted' | 'declined';
  message?: string | null;
  createdAt: string;
  respondedAt?: string | null;
  song?: { id: string; title: string; kind?: string; coSignStatus?: string; audioUrl?: string; userId: string } | null;
  parentBeat?: { id: string; title: string; userId: string } | null;
  producer?: { id: string; username: string } | null;
  requester?: { id: string; username: string } | null;
}

/**
 * Feature / co-sign requests (Nov 13): a singer asks the parent beat's
 * producer to feature their song. Accepting puts the song live; declining
 * marks it rejected. Plain DB/API — no on-chain co-sign exists. The
 * endpoints return 404 until the backend update lands; callers treat
 * that as "not available yet", never as a fake success.
 */
export async function requestFeature(songId: string, message?: string): Promise<FeatureRequest> {
  try {
    return await apiRequest<FeatureRequest>('/features', {
      method: 'POST',
      body: { songId, message },
      requiresAuth: true,
    });
  } catch (error) {
    console.error('Failed to request feature:', error);
    throw error;
  }
}

export async function getFeatureInbox(): Promise<FeatureRequest[]> {
  try {
    const res = await apiRequest<{ requests: FeatureRequest[] }>('/features/inbox', {
      requiresAuth: true,
    });
    return res.requests;
  } catch (error) {
    console.error('Failed to fetch feature inbox:', error);
    throw error;
  }
}

export async function getFeatureSent(): Promise<FeatureRequest[]> {
  try {
    const res = await apiRequest<{ requests: FeatureRequest[] }>('/features/sent', {
      requiresAuth: true,
    });
    return res.requests;
  } catch (error) {
    console.error('Failed to fetch sent feature requests:', error);
    throw error;
  }
}

export async function respondFeature(
  requestId: string,
  action: 'accept' | 'decline'
): Promise<FeatureRequest> {
  try {
    return await apiRequest<FeatureRequest>(`/features/${requestId}/respond`, {
      method: 'POST',
      body: { action },
      requiresAuth: true,
    });
  } catch (error) {
    console.error('Failed to respond to feature request:', error);
    throw error;
  }
}

export interface BeatCreatePayload {
  title: string;
  description?: string;
  genre: string;
  bpm?: number;
  price: number;
  // Make-a-song: kind 'song' + parentBeatId publish a vocal take linked
  // to a parent beat. The backend decides co-sign (own beat → live,
  // someone else's → pending); the client never sets coSignStatus.
  kind?: 'beat' | 'song';
  parentBeatId?: string;
}

/**
 * Resolve relative asset paths from the API (e.g. `/uploads/abc.m4a`)
 * against the API host so they play/render directly.
 */
function normalizeBeat(beat: Beat): Beat {
  return {
    ...beat,
    audioUrl: resolveMediaUrl(beat.audioUrl) ?? beat.audioUrl,
    imageUrl: resolveMediaUrl(beat.imageUrl) ?? undefined,
  };
}

/**
 * Create new beat — multipart upload to POST /v1/beats/upload.
 * The backend stores the file, computes the SHA-256 fingerprint, and
 * creates the beat record in one step.
 */
export async function createBeat(
  payload: BeatCreatePayload,
  audioFileUri: string
): Promise<Beat> {
  try {
    const formData = new FormData();
    formData.append('title', payload.title);
    if (payload.description) {
      formData.append('description', payload.description);
    }
    formData.append('genre', payload.genre);
    if (payload.bpm !== undefined) {
      formData.append('bpm', String(payload.bpm));
    }
    formData.append('price', String(payload.price));
    if (payload.kind) formData.append('kind', payload.kind);
    if (payload.parentBeatId) formData.append('parentBeatId', payload.parentBeatId);
    formData.append('audio', {
      uri: audioFileUri,
      name: `${payload.title}.m4a`,
      type: 'audio/m4a',
    } as unknown as Blob);

    const beat = await apiUpload<Beat>('/beats/upload', formData, {
      requiresAuth: true,
    });
    return normalizeBeat(beat);
  } catch (error) {
    console.error('Failed to create beat:', error);
    throw error;
  }
}

/**
 * Get all beats for current user
 */
export async function getUserBeats(): Promise<Beat[]> {
  try {
    const res = await apiRequest<{ beats: Beat[] }>('/beats/user', {
      requiresAuth: true,
    });
    return res.beats.map(normalizeBeat);
  } catch (error) {
    console.error('Failed to fetch user beats:', error);
    throw error;
  }
}

/**
 * Get beat by ID
 */
export async function getBeatById(beatId: string): Promise<Beat> {
  try {
    const beat = await apiRequest<Beat>(`/beats/${beatId}`, {
      requiresAuth: true,
    });
    return normalizeBeat(beat);
  } catch (error) {
    console.error('Failed to fetch beat:', error);
    throw error;
  }
}

/**
 * Update beat
 */
export async function updateBeat(
  beatId: string,
  payload: Partial<BeatCreatePayload>
): Promise<Beat> {
  try {
    const beat = await apiRequest<Beat>(`/beats/${beatId}`, {
      method: 'PUT',
      body: payload,
      requiresAuth: true,
    });
    return normalizeBeat(beat);
  } catch (error) {
    console.error('Failed to update beat:', error);
    throw error;
  }
}

/**
 * Delete beat
 */
export async function deleteBeat(beatId: string): Promise<void> {
  try {
    await apiRequest(`/beats/${beatId}`, {
      method: 'DELETE',
      requiresAuth: true,
    });
  } catch (error) {
    console.error('Failed to delete beat:', error);
    throw error;
  }
}

/**
 * Get beat marketplace (all public beats)
 */
export async function getMarketplaceBeats(
  page: number = 1,
  limit: number = 10,
  filters?: { genre?: string; minPrice?: number; maxPrice?: number; kind?: 'beat' | 'song' }
): Promise<{ beats: Beat[]; total: number; page: number }> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (filters?.genre) params.append('genre', filters.genre);
    if (filters?.minPrice) params.append('minPrice', String(filters.minPrice));
    if (filters?.maxPrice) params.append('maxPrice', String(filters.maxPrice));
    if (filters?.kind) params.append('kind', filters.kind);

    const res = await apiRequest<{
      beats: Beat[];
      total: number;
      page: number;
    }>(`/beats/marketplace?${params.toString()}`);
    return { ...res, beats: res.beats.map(normalizeBeat) };
  } catch (error) {
    console.error('Failed to fetch marketplace beats:', error);
    throw error;
  }
}

/**
 * Search beats
 */
export async function searchBeats(query: string): Promise<Beat[]> {
  try {
    const res = await apiRequest<{ beats: Beat[] }>(
      `/beats/search?q=${encodeURIComponent(query)}`,
      { requiresAuth: true }
    );
    return res.beats.map(normalizeBeat);
  } catch (error) {
    console.error('Failed to search beats:', error);
    throw error;
  }
}

/**
 * Make-a-song co-sign queue: songs over MY beats awaiting my approval.
 * Returns [] until the backend update lands (404 = old backend).
 */
export async function getPendingCoSign(): Promise<Beat[]> {
  try {
    const res = await apiRequest<{ beats: Beat[] }>('/beats/pending-co-sign', {
      requiresAuth: true,
    });
    return res.beats.map(normalizeBeat);
  } catch (error) {
    console.error('Failed to fetch pending co-signs:', error);
    throw error;
  }
}

/**
 * Approve or reject a song over my beat. Only the parent beat's producer
 * can call this; the backend enforces it. No on-chain step exists.
 */
export async function coSignBeat(
  beatId: string,
  action: 'approve' | 'reject'
): Promise<Beat> {
  try {
    const beat = await apiRequest<Beat>(`/beats/${beatId}/co-sign`, {
      method: 'POST',
      body: { action },
      requiresAuth: true,
    });
    return normalizeBeat(beat);
  } catch (error) {
    console.error('Failed to co-sign beat:', error);
    throw error;
  }
}

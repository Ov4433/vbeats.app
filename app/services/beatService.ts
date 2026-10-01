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
}

export interface BeatCreatePayload {
  title: string;
  description?: string;
  genre: string;
  bpm?: number;
  price: number;
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
  filters?: { genre?: string; minPrice?: number; maxPrice?: number }
): Promise<{ beats: Beat[]; total: number; page: number }> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (filters?.genre) params.append('genre', filters.genre);
    if (filters?.minPrice) params.append('minPrice', String(filters.minPrice));
    if (filters?.maxPrice) params.append('maxPrice', String(filters.maxPrice));

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

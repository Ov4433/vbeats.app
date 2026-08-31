// Beat Service for VbeatS
// Handles beat creation, upload, and management

import { apiRequest } from './api';
import * as FileSystem from 'expo-file-system';

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
 * Create new beat
 */
export async function createBeat(
  payload: BeatCreatePayload,
  audioFileUri: string
): Promise<Beat> {
  try {
    // Read audio file as base64
    const audioBase64 = await FileSystem.readAsStringAsync(audioFileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const beatData = {
      ...payload,
      audio: {
        data: audioBase64,
        mimeType: 'audio/m4a',
        name: `${payload.title}.m4a`,
      },
    };

    return await apiRequest('/beats', {
      method: 'POST',
      body: beatData,
      requiresAuth: true,
    });
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
    return await apiRequest('/beats/user', {
      requiresAuth: true,
    });
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
    return await apiRequest(`/beats/${beatId}`, {
      requiresAuth: true,
    });
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
    return await apiRequest(`/beats/${beatId}`, {
      method: 'PUT',
      body: payload,
      requiresAuth: true,
    });
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

    return await apiRequest(`/beats/marketplace?${params.toString()}`);
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
    return await apiRequest(
      `/beats/search?q=${encodeURIComponent(query)}`,
      { requiresAuth: true }
    );
  } catch (error) {
    console.error('Failed to search beats:', error);
    throw error;
  }
}

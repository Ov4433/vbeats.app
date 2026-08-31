import { useState, useCallback } from 'react';
import {
  createBeat,
  getUserBeats,
  getBeatById,
  updateBeat,
  deleteBeat,
  getMarketplaceBeats,
  searchBeats,
  Beat,
  BeatCreatePayload,
} from '../services/beatService';

export function useBeats() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserBeats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserBeats();
      setBeats(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch beats';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBeat = useCallback(async (beatId: string) => {
    setLoading(true);
    setError(null);
    try {
      const beat = await getBeatById(beatId);
      setCurrentBeat(beat);
      return beat;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch beat';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (payload: BeatCreatePayload, audioFileUri: string) => {
      setLoading(true);
      setError(null);
      try {
        const newBeat = await createBeat(payload, audioFileUri);
        setBeats([newBeat, ...beats]);
        return newBeat;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create beat';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [beats]
  );

  const update = useCallback(
    async (beatId: string, payload: Partial<BeatCreatePayload>) => {
      setLoading(true);
      setError(null);
      try {
        const updatedBeat = await updateBeat(beatId, payload);
        setBeats(
          beats.map((beat) => (beat.id === beatId ? updatedBeat : beat))
        );
        if (currentBeat?.id === beatId) {
          setCurrentBeat(updatedBeat);
        }
        return updatedBeat;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update beat';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [beats, currentBeat]
  );

  const remove = useCallback(
    async (beatId: string) => {
      setLoading(true);
      setError(null);
      try {
        await deleteBeat(beatId);
        setBeats(beats.filter((beat) => beat.id !== beatId));
        if (currentBeat?.id === beatId) {
          setCurrentBeat(null);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete beat';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [beats, currentBeat]
  );

  const fetchMarketplace = useCallback(
    async (page?: number, limit?: number, filters?: any) => {
      setLoading(true);
      setError(null);
      try {
        return await getMarketplaceBeats(page, limit, filters);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch marketplace';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      return await searchBeats(query);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to search beats';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    beats,
    currentBeat,
    loading,
    error,
    fetchUserBeats,
    fetchBeat,
    create,
    update,
    remove,
    fetchMarketplace,
    search,
  };
}

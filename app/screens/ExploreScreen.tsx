import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
} from 'react-native';
import { useBeats } from '../hooks/useBeats';
import { Beat, searchBeats } from '../services/beatService';

// Explore: the beats library — search the marketplace, tap into a beat.
export default function ExploreScreen({ navigation }: any) {
  const { fetchMarketplace } = useBeats();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [all, setAll] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMarketplace(1, 30);
      setBeats(res.beats || []);
      setAll(res.beats || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load beats');
    } finally {
      setLoading(false);
    }
  }, [fetchMarketplace]);

  useEffect(() => {
    load();
  }, [load]);

  const runSearch = async (q: string) => {
    setQuery(q);
    const needle = q.trim().toLowerCase();
    if (!needle) {
      setBeats(all);
      return;
    }
    try {
      const found = await searchBeats(q.trim());
      setBeats(found);
    } catch {
      // Search endpoint needs auth — fall back to filtering what's loaded.
      setBeats(
        all.filter(
          (b) =>
            b.title.toLowerCase().includes(needle) ||
            (b.genre || '').toLowerCase().includes(needle)
        )
      );
    }
  };

  if (loading && beats.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff3d9a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore</Text>
      <TextInput
        style={styles.search}
        placeholder="Search beats, genres…"
        placeholderTextColor="#666"
        value={query}
        onChangeText={runSearch}
        returnKeyType="search"
      />
      {error && beats.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={beats}
          keyExtractor={(b) => b.id}
          onRefresh={load}
          refreshing={loading}
          ListEmptyComponent={<Text style={styles.empty}>No beats found.</Text>}
          renderItem={({ item: beat }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('BeatDetail', { beatId: beat.id })}
            >
              {beat.imageUrl ? (
                <Image source={{ uri: beat.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={styles.thumbGlyph}>♪</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{beat.title}</Text>
                <Text style={styles.rowMeta}>
                  {beat.genre}
                  {beat.bpm ? ` · ${beat.bpm} BPM` : ''}
                  {beat.duration ? ` · ${Math.floor(beat.duration / 60)}:${String(Math.round(beat.duration % 60)).padStart(2, '0')}` : ''}
                </Text>
              </View>
              <Text style={styles.rowPrice}>${beat.price}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 16, paddingTop: 18 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  search: {
    backgroundColor: '#14141c', borderWidth: 1, borderColor: '#23232e', borderRadius: 10,
    color: '#fff', paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbFallback: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { color: '#ff3d9a', fontSize: 20 },
  rowTitle: { color: '#fff', fontWeight: '700', fontSize: 15.5 },
  rowMeta: { color: '#9a9aa8', fontSize: 12.5, marginTop: 2 },
  rowPrice: { color: '#fff', fontWeight: '800', fontSize: 15 },
  errorText: { color: '#ff6b5e', marginBottom: 14, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#888', textAlign: 'center', padding: 28 },
});

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
} from 'react-native';
import { useBeats } from '../hooks/useBeats';
import { Beat } from '../services/beatService';

// Cards: the marketplace as collectible beat cards — the NFT view.
export default function CardsScreen({ navigation }: any) {
  const { fetchMarketplace } = useBeats();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMarketplace(1, 24);
      setBeats(res.beats || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }, [fetchMarketplace]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && beats.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff3d9a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Beat Cards</Text>
      <Text style={styles.note}>
        Every card is a beat with its receipt on Base — tap one for the full card.
      </Text>
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
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          onRefresh={load}
          refreshing={loading}
          ListEmptyComponent={<Text style={styles.empty}>No cards yet — the first beat dropped becomes card #1.</Text>}
          renderItem={({ item: beat }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BeatDetail', { beatId: beat.id })}
            >
              {beat.imageUrl ? (
                <Image source={{ uri: beat.imageUrl }} style={styles.cardArt} />
              ) : (
                <View style={[styles.cardArt, styles.artFallback]}>
                  <Text style={styles.artGlyph}>♪</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{beat.title}</Text>
                <Text style={styles.cardMeta}>
                  {beat.genre}
                  {beat.bpm ? ` · ${beat.bpm} BPM` : ''}
                </Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardPrice}>${beat.price}</Text>
                  <Text style={styles.chip}>✓ VERIFIED</Text>
                </View>
              </View>
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
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  note: { color: '#9a9aa8', fontSize: 13, marginTop: 4, marginBottom: 14 },
  gridRow: { gap: 14, marginBottom: 14 },
  card: {
    flex: 1, backgroundColor: '#101016', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#963cff',
  },
  cardArt: { width: '100%', aspectRatio: 1, backgroundColor: '#14141c' },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  artGlyph: { color: '#23232e', fontSize: 44 },
  cardBody: { padding: 10 },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  cardMeta: { color: '#9a9aa8', fontSize: 12, marginTop: 2, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chip: { color: '#34c759', fontSize: 9.5, fontWeight: '800' },
  errorText: { color: '#ff6b5e', marginBottom: 14, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#888', textAlign: 'center', padding: 28 },
});

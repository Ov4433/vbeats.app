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
import { StatusBar } from 'expo-status-bar';
import { useBeats } from '../hooks/useBeats';
import { Beat } from '../services/beatService';
import { playAudio, pauseAudio } from '../services/audioService';

// Rapchat-style home: a social feed of beats. Every post is a real
// marketplace beat — play it in the feed, open its card, or remix it.
export default function HomeScreen({ navigation }: any) {
  const { fetchMarketplace } = useBeats();
  const [posts, setPosts] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'following' | 'trending'>('following');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMarketplace(1, 20);
      setPosts(res.beats || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the feed');
    } finally {
      setLoading(false);
    }
  }, [fetchMarketplace]);

  useEffect(() => {
    load();
    return () => {
      pauseAudio().catch(() => {});
    };
  }, [load]);

  const togglePlay = async (beat: Beat) => {
    try {
      if (playingId === beat.id) {
        await pauseAudio();
        setPlayingId(null);
      } else {
        await playAudio(beat.audioUrl);
        setPlayingId(beat.id);
      }
    } catch {
      setPlayingId(null);
    }
  };

  const shown =
    mode === 'trending'
      ? [...posts].sort((a, b) => (b.price || 0) - (a.price || 0))
      : posts;

  if (loading && posts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff3d9a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Verified Beats Studio</Text>
        <Text style={styles.tagline}>Volt keeps the receipts.</Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggle, mode === 'following' && styles.toggleOn]}
          onPress={() => setMode('following')}
        >
          <Text style={[styles.toggleText, mode === 'following' && styles.toggleTextOn]}>
            Following
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggle, mode === 'trending' && styles.toggleOn]}
          onPress={() => setMode('trending')}
        >
          <Text style={[styles.toggleText, mode === 'trending' && styles.toggleTextOn]}>
            Trending
          </Text>
        </TouchableOpacity>
      </View>

      {error && posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(b) => b.id}
          onRefresh={load}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.empty}>No beats yet — be the first to drop one.</Text>
          }
          renderItem={({ item: beat }) => (
            <View style={styles.post}>
              <View style={styles.postHead}>
                {beat.imageUrl ? (
                  <Image source={{ uri: beat.imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarGlyph}>♪</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.who}>{beat.title}</Text>
                  <Text style={styles.sub}>
                    {beat.genre}
                    {beat.bpm ? ` · ${beat.bpm} BPM` : ''}
                  </Text>
                </View>
                <Text style={styles.chip}>✓ VERIFIED</Text>
              </View>

              {beat.imageUrl ? (
                <Image source={{ uri: beat.imageUrl }} style={styles.art} />
              ) : (
                <View style={[styles.art, styles.artFallback]}>
                  <Text style={styles.artGlyph}>♪</Text>
                </View>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={() => togglePlay(beat)}
                >
                  <Text style={styles.playGlyph}>
                    {playingId === beat.id ? '❚❚' : '▶'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.price}>${beat.price}</Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('BeatDetail', { beatId: beat.id })}
                >
                  <Text style={styles.primaryBtnText}>Lease / Mint</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={() => navigation.navigate('RecordBeat')}
                >
                  <Text style={styles.ghostBtnText}>Remix</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 20 },
  topBar: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  logo: { color: '#fff', fontSize: 22, fontWeight: '800' },
  tagline: { color: '#888', fontSize: 13, marginTop: 2 },
  toggleRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 10 },
  toggle: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#23232e', backgroundColor: '#101016' },
  toggleOn: { backgroundColor: '#fff', borderColor: '#fff' },
  toggleText: { color: '#9a9aa8', fontWeight: '700', fontSize: 14 },
  toggleTextOn: { color: '#000' },
  post: { backgroundColor: '#101016', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#23232e', marginBottom: 18 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { color: '#ff3d9a', fontSize: 18 },
  who: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: '#9a9aa8', fontSize: 12.5 },
  chip: { color: '#34c759', fontSize: 11, fontWeight: '800', borderWidth: 1, borderColor: 'rgba(52,199,89,.4)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  art: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#14141c' },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  artGlyph: { color: '#23232e', fontSize: 64 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: '#000', fontSize: 15, fontWeight: '800' },
  price: { color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 },
  primaryBtn: { backgroundColor: '#963cff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  ghostBtn: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 },
  ghostBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  errorText: { color: '#ff6b5e', marginBottom: 14, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#888', textAlign: 'center', padding: 28 },
});

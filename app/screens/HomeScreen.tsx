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
//
// Grok fixes (Nov 13), rebuilt here:
// - Dual-path hero: Producer vs Listener/Artist, not a feature dump.
// - No fake "Following" tab — the feed is Feed/Trending, sorted by
//   plays + votes, never by price. (The mobile Beat type has no
//   plays/votes fields yet, so when the backend doesn't return them
//   the feed keeps backend order instead of inventing a sort.)
// - No hard-coded "✓ VERIFIED" chip. A beat shows "✓ Fingerprinted"
//   only when the backend actually returned a fingerprint, otherwise
//   "Not verified yet". On-chain status is not claimed here at all.
// - Card CTA is "Buy now" only when there is a price signal, otherwise
//   "Make offer". Price is shown as ETH first, never "$" + an ETH number.
// - Soft-auth note: browsing is free; sign-in is only asked when you act.
export default function HomeScreen({ navigation }: any) {
  const { fetchMarketplace } = useBeats();
  const [posts, setPosts] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        setPlayingId(null);
      }
    } catch {
      setPlayingId(null);
    }
  };

  // Trending = plays + votes. The mobile API response does not carry
  // plays/votes yet — when neither is present, keep backend order
  // instead of sorting by price (which is not popularity).
  const trendScore = (b: Beat) => {
    const plays = b.stats?.plays || 0;
    const votes = b.votes?.totalWeight || 0;
    return plays + 2 * votes;
  };
  const hasTrendData = posts.some((b) => trendScore(b) > 0);
  const shown = hasTrendData
    ? [...posts].sort((a, b) => trendScore(b) - trendScore(a))
    : posts;

  const primaryCta = (beat: Beat) =>
    Number(beat.price) > 0 ? 'Buy now' : 'Make offer';

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

      {/* Dual-path hero: Producer vs Listener/Artist */}
      <View style={styles.pathRow}>
        <TouchableOpacity
          style={[styles.pathCard, styles.pathProducer]}
          onPress={() => navigation.navigate('RecordBeat')}
        >
          <Text style={styles.pathGlyph}>⏺</Text>
          <Text style={styles.pathTitle}>I&rsquo;m a producer</Text>
          <Text style={styles.pathSub}>Record, build a beat &amp; list it.</Text>
          <Text style={styles.pathCta}>Open the studio →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pathCard, styles.pathListener]}
          onPress={() => navigation.navigate('Explore')}
        >
          <Text style={styles.pathGlyph}>🧭</Text>
          <Text style={styles.pathTitle}>I&rsquo;m looking for beats</Text>
          <Text style={styles.pathSub}>Preview, buy or make an offer.</Text>
          <Text style={styles.pathCta}>Find beats →</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.softAuth}>
        Browsing is free — sign in only when you buy, vote or upload.
      </Text>

      <View style={styles.toggleRow}>
        <View style={[styles.toggle, styles.toggleOn]}>
          <Text style={[styles.toggleText, styles.toggleTextOn]}>Trending</Text>
        </View>
        <Text style={styles.trendNote}>plays + votes, not price</Text>
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
                {beat.fingerprint ? (
                  <Text style={styles.chip}>✓ Fingerprinted</Text>
                ) : (
                  <Text style={[styles.chip, styles.chipUnverified]}>Not verified yet</Text>
                )}
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
                <Text style={styles.price}>
                  {Number(beat.price) > 0 ? `${beat.price} ETH` : 'Offer'}
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('BeatDetail', { beatId: beat.id })}
                >
                  <Text style={styles.primaryBtnText}>{primaryCta(beat)}</Text>
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
  pathRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  pathCard: { flex: 1, backgroundColor: '#101016', borderWidth: 1, borderColor: '#23232e', borderRadius: 14, padding: 14 },
  pathProducer: { borderLeftWidth: 3, borderLeftColor: '#f5c542' },
  pathListener: { borderLeftWidth: 3, borderLeftColor: '#ff3d9a' },
  pathGlyph: { fontSize: 20, marginBottom: 6 },
  pathTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pathSub: { color: '#9a9aa8', fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  pathCta: { color: '#ff3d9a', fontWeight: '800', fontSize: 13, marginTop: 8 },
  softAuth: { color: '#9a9aa8', fontSize: 12.5, textAlign: 'center', paddingHorizontal: 16, paddingTop: 10 },
  toggleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  toggle: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#23232e', backgroundColor: '#101016' },
  toggleOn: { backgroundColor: '#ff3d9a', borderColor: '#ff3d9a' },
  toggleText: { color: '#9a9aa8', fontWeight: '700', fontSize: 14 },
  toggleTextOn: { color: '#fff' },
  trendNote: { color: '#888', fontSize: 12 },
  post: { backgroundColor: '#101016', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#23232e', marginBottom: 18 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { color: '#ff3d9a', fontSize: 18 },
  who: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: '#9a9aa8', fontSize: 12.5 },
  chip: { color: '#34c759', fontSize: 11, fontWeight: '800', borderWidth: 1, borderColor: 'rgba(52,199,89,.4)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  chipUnverified: { color: '#c9a7ff', borderColor: 'rgba(150,60,255,.4)' },
  art: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#14141c' },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  artGlyph: { color: '#23232e', fontSize: 64 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: '#000', fontSize: 15, fontWeight: '800' },
  price: { color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 },
  primaryBtn: { backgroundColor: '#ff3d9a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  ghostBtn: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 },
  ghostBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  errorText: { color: '#ff6b5e', marginBottom: 14, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#23232e', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#888', textAlign: 'center', padding: 28 },
});

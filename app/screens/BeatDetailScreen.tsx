import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useBeats } from '../hooks/useBeats';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { getCurrentUser } from '../services/authService';
import { requestFeature, getFeatureSent, coSignBeat } from '../services/beatService';
import Button from '../components/Button';
import { Linking } from 'react-native';

export default function BeatDetailScreen({ route, navigation }: any) {
  const { beatId } = route.params;
  const { fetchBeat, currentBeat, loading, remove } = useBeats();
  const recorder = useAudioRecorder();
  const [isEditing, setIsEditing] = useState(false);
  // Feature / co-sign request (Nov 13): who am I relative to this song?
  const [myId, setMyId] = useState<string | null>(null);
  const [featureSent, setFeatureSent] = useState(false);
  const [featureNote, setFeatureNote] = useState('');

  useEffect(() => {
    if (!currentBeat) return;
    void getCurrentUser().then((u) => setMyId(u?.id ?? null));
  }, [currentBeat?.id]);

  useEffect(() => {
    if (!myId || !currentBeat || myId !== currentBeat.userId) return;
    void getFeatureSent()
      .then((list) => {
        setFeatureSent(list.some((r) => r.songId === currentBeat.id && r.status === 'pending'));
      })
      .catch(() => {});
  }, [myId, currentBeat]);

  const handleRequestFeature = async () => {
    if (!currentBeat) return;
    try {
      await requestFeature(currentBeat.id);
      setFeatureSent(true);
      setFeatureNote('Request sent — awaiting the producer.');
    } catch (e: any) {
      setFeatureNote(
        String(e?.message || '').includes('404')
          ? 'Feature requests need the latest backend — it has not landed yet, so this request cannot be sent right now.'
          : 'Could not send the request — try again.'
      );
    }
  };

  const handleFeatureAnswer = async (action: 'approve' | 'reject') => {
    if (!currentBeat) return;
    try {
      await coSignBeat(currentBeat.id, action);
      await fetchBeat(currentBeat.id);
    } catch {
      Alert.alert('Error', 'Could not answer the request');
    }
  };

  // Share (money path, Nov 13): the real beat/song URL — song + parent
  // beat + fingerprint in the text, never a fake short link.
  const handleShare = async () => {
    if (!currentBeat) return;
    const url = `https://ov4433.github.io/vbeats.app/beat.html?id=${encodeURIComponent(currentBeat.id)}`;
    const text =
      currentBeat.kind === 'song'
        ? `🎤 ${currentBeat.title} — a song over "${currentBeat.parentBeat?.title || 'the parent beat'}" on Verified Beats Studio`
        : `🎧 ${currentBeat.title} — a verified beat on Verified Beats Studio`;
    try {
      await Share.share({
        title: currentBeat.title,
        message: text + (currentBeat.fingerprint ? ` · fingerprint ${currentBeat.fingerprint.slice(0, 10)}…` : '') + '\n' + url,
        url,
      });
    } catch {
      Alert.alert('Share failed', 'Copy the beat link from the web page instead.');
    }
  };

  const isProducer = !!myId && !!currentBeat && myId === currentBeat.userId;

  useEffect(() => {
    const loadBeat = async () => {
      await fetchBeat(beatId);
    };

    void loadBeat();
    void recorder.initialize();
    return () => {
      void recorder.cleanup();
    };
  }, [beatId, fetchBeat, recorder]);

  const handlePlayBeat = async () => {
    if (currentBeat) {
      try {
        if (recorder.isPlaying) {
          await recorder.stop();
        } else {
          await recorder.play(currentBeat.audioUrl);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to play beat');
      }
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Beat',
      'Are you sure you want to delete this beat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(beatId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete beat');
            }
          },
        },
      ]
    );
  };

  // Ownership path (Grok, Nov 13): listed → buy, unlisted → offer.
  // Mobile has no in-app buy/offer flow yet, so the buttons open the
  // real web beat page (#buy / #offer) — never a fake in-app purchase.
  // The full listed price goes to the producer; the BeatNFT contract
  // takes no platform fee on direct buy.
  const listed = Number(currentBeat?.price) > 0;
  const webBeatUrl = (anchor: string) =>
    `https://ov4433.github.io/vbeats.app/beat.html?id=${encodeURIComponent(currentBeat?.id || beatId)}${anchor}`;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff3d9a" />
      </View>
    );
  }

  if (!currentBeat) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Beat not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
          <Text style={styles.editButton}>{isEditing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.beatCard}>
        <View style={styles.beatHeader}>
          <View>
            <Text style={styles.beatTitle}>{currentBeat.title}</Text>
            <Text style={styles.beatGenre}>{currentBeat.genre}</Text>
          </View>
          <Text style={styles.beatPrice}>
            {Number(currentBeat.price) > 0 ? `${currentBeat.price} ETH` : 'Offer'}
          </Text>
        </View>

        {currentBeat.fingerprint ? (
          <Text style={[styles.chip, styles.chipFingerprinted]}>✓ Fingerprinted</Text>
        ) : (
          <Text style={[styles.chip, styles.chipUnverified]}>Not verified yet</Text>
        )}
        {currentBeat.fingerprint ? (
          <Text style={styles.fingerprint} numberOfLines={1}>
            {currentBeat.fingerprint}
          </Text>
        ) : null}

        {currentBeat.description && (
          <Text style={styles.description}>{currentBeat.description}</Text>
        )}

        <View style={styles.metaRow}>
          {currentBeat.bpm && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>BPM</Text>
              <Text style={styles.metaValue}>{currentBeat.bpm}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Duration</Text>
            <Text style={styles.metaValue}>
              {Math.floor(currentBeat.duration / 1000)}s
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>
              {new Date(currentBeat.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.playButton,
            recorder.isPlaying && styles.playButtonActive,
          ]}
          onPress={handlePlayBeat}
        >
          <Text style={styles.playButtonText}>
            {recorder.isPlaying ? '⏸️ Pause' : '▶️ Play Beat'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Make-a-song (Nov 13): a song shows its parent beat and its
          co-sign state; a beat gets a "Rap on this beat" path. */}
      {currentBeat.kind === 'song' ? (
        <View style={styles.pathCard}>
          <Text style={styles.pathTitle}>
            🎤 Song · over {currentBeat.parentBeat?.title || 'the parent beat'}
          </Text>
          <Text style={styles.pathSub}>
            Vocals by this song’s maker, over the producer’s beat. The backing track stays licensed on the parent beat’s page.
          </Text>
          {currentBeat.coSignStatus === 'pending' && (
            <Text style={styles.pathSub}>⏳ Awaiting producer co-sign — saved, but not in the public feed until the parent beat’s producer approves it.</Text>
          )}
          {currentBeat.coSignStatus === 'rejected' && (
            <Text style={styles.pathSub}>The parent beat’s producer declined this song.</Text>
          )}
          {currentBeat.coSignStatus === 'live' && currentBeat.coSignedBy && (
            <Text style={styles.pathSub}>✓ Co-signed by {currentBeat.coSignedBy.username} — the parent beat’s producer featured this song.</Text>
          )}
          {currentBeat.parentBeatId && (
            <Button
              title="Open the parent beat"
              onPress={() => navigation.navigate('BeatDetail', { beatId: currentBeat.parentBeatId })}
            />
          )}
        </View>
      ) : (
        <View style={styles.pathCard}>
          <Text style={styles.pathTitle}>🎤 Make a song</Text>
          <Text style={styles.pathSub}>
            Rap over this beat — record your vocals, publish a fingerprinted song linked to it. Your vocal take is yours; the beat’s license stays here.
          </Text>
          <Button
            title="🎤 Rap on this beat"
            onPress={() => navigation.navigate('MakeSong', { beatId: currentBeat.id })}
          />
        </View>
      )}

      {/* Feature / co-sign request (Nov 13): on a pending song, the
          singer asks the parent beat's producer to feature it; the
          producer answers right here. One pending request per song. */}
      {currentBeat.kind === 'song' && currentBeat.coSignStatus === 'pending' && (
        <View style={styles.pathCard}>
          <Text style={styles.pathTitle}>🎤 Request feature</Text>
          {myId === null ? (
            <Text style={styles.pathSub}>Sign in to ask the parent beat’s producer to feature this song.</Text>
          ) : myId === currentBeat.parentBeat?.userId ? (
            <>
              <Text style={styles.pathSub}>
                This song raps over your beat and is waiting on you. Accepting puts it live in the feed; declining keeps it out.
              </Text>
              <Button title="Accept — feature it" onPress={() => void handleFeatureAnswer('approve')} />
              <Button title="Decline" variant="secondary" onPress={() => void handleFeatureAnswer('reject')} />
            </>
          ) : myId === currentBeat.userId ? (
            <>
              <Text style={styles.pathSub}>
                Ask the parent beat’s producer to feature your song — that is what puts it live in the feed. One request at a time.
              </Text>
              <Button
                title={featureSent ? 'Request sent' : 'Request feature'}
                onPress={() => void handleRequestFeature()}
              />
              {featureNote ? <Text style={styles.pathSub}>{featureNote}</Text> : null}
            </>
          ) : (
            <Text style={styles.pathSub}>
              This song is awaiting the parent beat’s producer — only the singer can request the feature, and only the producer can answer it.
            </Text>
          )}
        </View>
      )}

      {/* Ownership path: listed → buy, unlisted → offer. */}
      <View style={styles.pathCard}>
        <Text style={styles.pathTitle}>
          {listed ? 'Listed — buy this license' : 'Not listed yet — make an offer'}
        </Text>
        <Text style={styles.pathSub}>
          {listed
            ? `${currentBeat.price} ETH — the full listed price goes to the producer, no platform fee on direct buy.`
            : 'The producer has not set a price or stocked licenses yet, so instant buy is not available — you can still make an offer.'}
        </Text>
        <Text style={styles.pathSub}>
          {listed
            ? 'Buying opens the beat page on the web, where the live BeatNFT listing is checked before you pay.'
            : 'Offers are made on the web beat page, where the producer can accept, counter or reject.'}
        </Text>
        <Button
          title={listed ? 'Buy now' : 'Make offer'}
          onPress={() => Linking.openURL(webBeatUrl(listed ? '#buy' : '#offer'))}
        />
      </View>

      {/* Producer listing (money path, Nov 13): listing happens on the
          web beat page (#list) — the real setPrice / stockForSale calls
          run there with the connected wallet. Mobile never fakes a
          listing; it deep-links to the real form. */}
      {isProducer && currentBeat.kind !== 'song' && (
        <View style={styles.pathCard}>
          <Text style={styles.pathTitle}>🏷️ List for sale</Text>
          <Text style={styles.pathSub}>
            You are the producer. Set a lease price, stock, and an exclusive price on the web beat page — two wallet confirmations per type — and instant buy goes live. Platform fee: not set yet, so the full listed price goes to you.
          </Text>
          <Button
            title="List for sale on the web"
            onPress={() => Linking.openURL(webBeatUrl('#list'))}
          />
        </View>
      )}

      {/* Post-purchase next steps — what happens AFTER you buy, not a
          claim that a purchase has happened here. */}
      <View style={styles.pathCard}>
        <Text style={styles.pathTitle}>After you buy</Text>
        <Text style={styles.pathSub}>1 · Download — your licensed audio, ready to use.</Text>
        <Text style={styles.pathSub}>2 · Release — drop your track with the license in hand.</Text>
        <Text style={styles.pathSub}>3 · Keep receipt — the on-chain receipt stays on your beat card.</Text>
        <Button
          title="View my purchases"
          onPress={() => navigation.navigate('Profile')}
        />
      </View>

      <View style={styles.actions}>
        <Button title="Share" onPress={() => void handleShare()} variant="secondary" />
        <Button
          title="Delete"
          onPress={handleDelete}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  backButton: {
    color: '#ff3d9a',
    fontSize: 16,
    fontWeight: '600',
  },
  editButton: {
    color: '#ff3d9a',
    fontSize: 16,
    fontWeight: '600',
  },
  beatCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  beatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  beatTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  beatGenre: {
    fontSize: 14,
    color: '#888',
  },
  beatPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  chip: {
    fontSize: 11,
    fontWeight: '800',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  chipFingerprinted: { color: '#34c759', borderColor: 'rgba(52,199,89,.4)' },
  chipUnverified: { color: '#c9a7ff', borderColor: 'rgba(150,60,255,.4)' },
  fingerprint: { color: '#888', fontSize: 11, marginBottom: 12 },
  pathCard: {
    backgroundColor: '#101016',
    borderWidth: 1,
    borderColor: '#23232e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  pathTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  pathSub: { color: '#9a9aa8', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  description: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
    marginVertical: 12,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  playButton: {
    backgroundColor: '#ff3d9a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  playButtonActive: {
    backgroundColor: '#d12a7d',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    marginBottom: 20,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
  },
});

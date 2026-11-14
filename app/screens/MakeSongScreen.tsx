import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Vibration,
} from 'react-native';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useBeats } from '../hooks/useBeats';
import { searchBeats, Beat } from '../services/beatService';
import Button from '../components/Button';

// Make a song (Nov 13): Rapchat-style vocal take over a fingerprinted
// beat, with VBeats ownership on it. Pick a beat → record vocals →
// publish a fingerprinted song linked to the parent beat.
//
// Timed booth (Nov 13): 8 / 16 / 32 bars or Free, timed from the parent
// beat's BPM (default 140), 1-bar count-in, auto-stop at the window end,
// live "bars left" readout.
//
// Honest limits of this screen (do not paper over them):
// - The parent beat plays to learn it, then PAUSES while you record —
//   this device's recorder hook cannot guarantee looped playback during
//   a mic take. The published take is your vocals, linked to the beat.
// - No mixed preview on mobile: the audio service plays one sound at a
//   time, so beat + vocal together is web-only for now. Play the beat
//   and your take separately here.
// - No mix export on mobile either — exporting a mixed .wav is web-only
//   for now (OfflineAudioContext). The take itself still publishes.
// - The metronome here is a short vibration per count-in beat, not a
//   click sound — the recorder hook owns the audio path.
// - Co-sign: a song over YOUR OWN beat publishes live immediately. A
//   song over SOMEONE ELSE'S beat is saved as "Awaiting producer
//   co-sign" and stays out of the public feed until they approve it
//   (backend decides this; the client never sets it).
export default function MakeSongScreen({ route, navigation }: any) {
  const { beatId: presetBeatId } = route.params || {};
  const recorder = useAudioRecorder();
  const { fetchBeat, create, loading: beatLoading } = useBeats();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Beat[]>([]);
  const [searching, setSearching] = useState(false);
  const [parent, setParent] = useState<Beat | null>(null);
  const [title, setTitle] = useState('');
  const [hasTake, setHasTake] = useState(false);
  // Timed booth (Nov 13): bar count, default 16. 'free' = manual stop.
  const [barLen, setBarLen] = useState<number | 'free'>(16);
  const [countIn, setCountIn] = useState<number | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Best-of-3 retakes (booth finisher, Nov 13): the recorder hook holds
  // one take at a time, so each finished take is snapshotted here. Keep
  // at most 3; one can be marked best, and publishing uses the selected
  // take, else the best, else the latest.
  const [takes, setTakes] = useState<Array<{ id: number; uri: string; durMs: number }>>([]);
  const [bestTakeId, setBestTakeId] = useState<number | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<number | null>(null);
  const takeSeqRef = useRef(1);
  const lastTakeUriRef = useRef<string | null>(null);
  const bestTakeIdRef = useRef<number | null>(null);
  // Metronome (booth finisher, Nov 13): vibration per count-in beat.
  const [metroOn, setMetroOn] = useState(false);

  // Snapshot each finished take as the recorder hook reports it. The
  // hook sets recordingData asynchronously after stop, so watch it
  // rather than reading it right after stopRecording() resolves.
  useEffect(() => {
    const d = recorder.recordingData;
    if (!d || d.uri === lastTakeUriRef.current) return;
    lastTakeUriRef.current = d.uri;
    const id = takeSeqRef.current++;
    setTakes((prev) => {
      const next = [...prev, { id, uri: d.uri, durMs: d.duration ?? recorder.duration }];
      if (next.length <= 3) return next;
      const drop = next.find((t) => t.id !== bestTakeIdRef.current);
      return drop ? next.filter((t) => t !== drop) : next.slice(1);
    });
    setSelectedTakeId(id);
    setHasTake(true);
  }, [recorder.recordingData]);

  const markBest = (id: number) => {
    bestTakeIdRef.current = id;
    setBestTakeId(id);
  };

  const deleteTake = (id: number) => {
    const next = takes.filter((t) => t.id !== id);
    setTakes(next);
    if (!next.length) setHasTake(false);
    if (bestTakeId === id) { bestTakeIdRef.current = null; setBestTakeId(null); }
    if (selectedTakeId === id) setSelectedTakeId(null);
  };

  const bpm = parent?.bpm || 140;
  const secPerBar = (4 * 60) / bpm;
  // Live "bars left" readout, derived from the recorder's running
  // duration (it updates every ~100ms while recording).
  const barsLeft =
    recorder.isRecording && barLen !== 'free'
      ? Math.max(0, barLen - Math.floor((recorder.duration || 0) / 1000 / secPerBar))
      : null;

  // Auto-stop at the end of the bar window (Free = manual stop only).
  useEffect(() => {
    if (recorder.isRecording && barLen !== 'free' && parent) {
      const windowMs = barLen * secPerBar * 1000;
      stopTimerRef.current = setTimeout(() => {
        void recorder
          .stopRecording()
          .then(() => setHasTake(true))
          .catch(() => {});
      }, windowMs);
      return () => {
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.isRecording, barLen, parent]);

  useEffect(() => {
    recorder.initialize();
    return () => {
      recorder.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadParent = useCallback(
    async (id: string) => {
      try {
        const b = await fetchBeat(id);
        setParent(b);
        setTitle((t) => t || `Song over ${b.title}`);
      } catch (err) {
        Alert.alert('Error', 'Could not load that beat');
      }
    },
    [fetchBeat]
  );

  useEffect(() => {
    if (presetBeatId) void loadParent(presetBeatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetBeatId]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const beats = await searchBeats(query.trim());
      setResults(beats.filter((b) => b.kind !== 'song'));
    } catch (err) {
      Alert.alert('Error', 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handlePlayParent = async () => {
    if (!parent) return;
    try {
      if (recorder.isPlaying) await recorder.stop();
      else await recorder.play(parent.audioUrl);
    } catch (err) {
      Alert.alert('Error', 'Failed to play beat');
    }
  };

  const handleRecord = async () => {
    try {
      // Playback pauses while recording — see the header note.
      if (recorder.isPlaying) await recorder.stop();
      if (recorder.isRecording) {
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        await recorder.stopRecording();
        setHasTake(!!recorder.recordingData);
      } else {
        if (!parent) {
          Alert.alert('Error', 'Pick a beat first');
          return;
        }
        // 1-bar count-in, at the beat's tempo (4 beats at its BPM).
        // Metronome on = one short vibration per beat.
        const beatMs = 60000 / bpm;
        for (let n = 4; n >= 1; n--) {
          setCountIn(n);
          if (metroOn) Vibration.vibrate(40);
          await new Promise((r) => setTimeout(r, beatMs));
        }
        setCountIn(null);
        await recorder.startRecording();
      }
    } catch (err) {
      setCountIn(null);
      Alert.alert('Error', 'Failed to record vocals');
    }
  };

  const handlePublish = async () => {
    if (!parent) {
      Alert.alert('Error', 'Pick a beat first');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Error', 'Give your song a title');
      return;
    }
    // Publish the selected take — or the best take, if one is marked.
    const pubTake =
      takes.find((t) => t.id === selectedTakeId) ||
      takes.find((t) => t.id === bestTakeId) ||
      takes[takes.length - 1];
    if (!pubTake) {
      Alert.alert('Error', 'Record your vocals first');
      return;
    }
    try {
      const song = await create(
        {
          title: title.trim(),
          genre: parent.genre,
          bpm: parent.bpm,
          price: 0,
          kind: 'song',
          parentBeatId: parent.id,
        },
        pubTake.uri
      );
      const pending = song.coSignStatus === 'pending';
      Alert.alert(
        pending ? 'Awaiting producer co-sign' : 'Song published',
        pending
          ? 'Saved, but not in the public feed yet — the parent beat’s producer has to approve it first.'
          : 'Your song is live in the feed, linked to the parent beat.',
        [
          {
            text: 'View song',
            onPress: () => navigation.navigate('BeatDetail', { beatId: song.id }),
          },
          { text: 'Record another', onPress: () => { /* takes stay — record over them, best of 3 kept */ } },
        ]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to publish song');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎤 Make a song</Text>
      <Text style={styles.subtitle}>
        Rap over a fingerprinted beat. Your vocal take is yours, linked to the producer’s beat — the license stays on the beat’s page.
      </Text>

      {/* Step 1 · Pick a beat */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1 · Pick a beat</Text>
        {!parent ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Search beats by title or genre"
              placeholderTextColor="#666"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
            />
            <Button
              title={searching ? 'Searching…' : 'Search'}
              onPress={handleSearch}
              style={styles.searchButton}
            />
            {results.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.resultRow}
                onPress={() => loadParent(b.id)}
              >
                <Text style={styles.resultTitle}>{b.title}</Text>
                <Text style={styles.resultSub}>
                  {b.genre}
                  {b.fingerprint ? ' · ✓ Fingerprinted' : ' · Not verified yet'}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.parentCard}>
            <Text style={styles.resultTitle}>{parent.title}</Text>
            <Text style={styles.resultSub}>
              {parent.genre}
              {parent.fingerprint ? ' · ✓ Fingerprinted' : ' · Not verified yet'}
            </Text>
            <TouchableOpacity onPress={() => setParent(null)}>
              <Text style={styles.changeLink}>Change beat</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Step 2 · Record vocals */}
      <View style={[styles.section, !parent && styles.dimmed]} pointerEvents={parent ? 'auto' : 'none'}>
        <Text style={styles.sectionTitle}>2 · Record your vocals</Text>
        <Text style={styles.note}>
          Play the beat to learn it — playback pauses while you record. Pick a length: timed from the beat’s BPM, with a 1-bar count-in and auto-stop at the end of the window.
        </Text>
        <View style={styles.chipRow}>
          {([8, 16, 32] as const).map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.chip, barLen === n && styles.chipOn]}
              onPress={() => setBarLen(n)}
            >
              <Text style={styles.chipText}>{n} bars</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, barLen === 'free' && styles.chipOn]}
            onPress={() => setBarLen('free')}
          >
            <Text style={styles.chipText}>Free</Text>
          </TouchableOpacity>
        </View>
        {parent && (
          <Text style={styles.note}>
            {barLen === 'free'
              ? 'Free — tap Stop when your verse is done.'
              : `${barLen} bars @ ${bpm} BPM ≈ ${Math.round(barLen * secPerBar)}s`}
          </Text>
        )}
        {countIn !== null && <Text style={styles.duration}>Count-in… {countIn}</Text>}
        {barsLeft !== null && (
          <Text style={styles.note}>Bars left: {barsLeft}</Text>
        )}
        {/* Bar grid (booth finisher, Nov 13): one box per bar; filled boxes
            are the bars already recorded. Free shows a 16-box grid. */}
        {parent && (
          <View style={styles.barGrid}>
            {Array.from({ length: barLen === 'free' ? 16 : barLen }).map((_, i) => {
              const elapsedBars =
                recorder.isRecording && barLen !== 'free'
                  ? Math.floor((recorder.duration || 0) / 1000 / secPerBar)
                  : 0;
              return (
                <View
                  key={i}
                  style={[styles.barCell, i < elapsedBars && styles.barCellOn]}
                />
              );
            })}
          </View>
        )}
        <TouchableOpacity
          style={styles.metroRow}
          onPress={() => setMetroOn(!metroOn)}
        >
          <Text style={styles.note}>
            {metroOn ? '☑' : '☐'} Metronome — vibrate on each count-in beat
          </Text>
        </TouchableOpacity>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.playButton} onPress={handlePlayParent}>
            <Text style={styles.buttonText}>
              {recorder.isPlaying ? '⏸️ Pause beat' : '▶️ Play beat'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recordButton, recorder.isRecording && styles.recordButtonActive]}
            onPress={handleRecord}
          >
            <Text style={styles.buttonText}>
              {recorder.isRecording ? '⏹️ Stop' : '⏺️ Record'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.duration}>{recorder.durationFormatted}</Text>
        {recorder.error && <Text style={styles.error}>{recorder.error}</Text>}
        {recorder.recordingData && (
          <TouchableOpacity
            style={styles.playButton}
            onPress={async () => {
              try {
                if (recorder.isPlaying) await recorder.stop();
                else await recorder.play(recorder.recordingData!.uri);
              } catch {
                Alert.alert('Error', 'Failed to play take');
              }
            }}
          >
            <Text style={styles.buttonText}>
              {recorder.isPlaying ? '⏸️ Pause take' : '▶️ Play my take'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Takes — best of 3 (booth finisher, Nov 13): keep up to 3 takes,
          mark one as best. Publishing uses the selected take, else the
          best, else the latest. */}
      {takes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Takes — best of 3</Text>
          {takes.map((t, idx) => {
            const isBest = t.id === bestTakeId;
            const isSelected = t.id === (selectedTakeId ?? takes.find((x) => x.id === bestTakeId)?.id ?? takes[takes.length - 1]?.id);
            return (
              <View key={t.id} style={styles.takeRow}>
                <Text style={styles.resultTitle}>
                  Take {idx + 1} · {Math.round(t.durMs / 1000)}s{isBest ? ' ★ Best' : ''}{isSelected ? ' · publishing' : ''}
                </Text>
                <View style={styles.takeActions}>
                  <TouchableOpacity onPress={() => setSelectedTakeId(t.id)}>
                    <Text style={styles.takeLink}>{isSelected ? 'Selected' : 'Select'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => markBest(t.id)}>
                    <Text style={styles.takeLink}>{isBest ? '★ Best' : 'Mark best'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        if (recorder.isPlaying) await recorder.stop();
                        else await recorder.play(t.uri);
                      } catch {
                        Alert.alert('Error', 'Failed to play take');
                      }
                    }}
                  >
                    <Text style={styles.takeLink}>Play</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteTake(t.id)}>
                    <Text style={styles.takeLink}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <Text style={styles.note}>Mix export is web-only for now — play the beat and your take separately here.</Text>
        </View>
      )}

      {/* Step 3 · Publish */}
      <View style={[styles.section, !(parent && hasTake) && styles.dimmed]} pointerEvents={parent && hasTake ? 'auto' : 'none'}>
        <Text style={styles.sectionTitle}>3 · Publish your song</Text>
        <Text style={styles.label}>Song title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Song over…"
          placeholderTextColor="#666"
          value={title}
          onChangeText={setTitle}
        />
        <Text style={styles.note}>
          Songs are not sold here — the license lives on the parent beat. Default collab split is 50/50, negotiable with the producer.
        </Text>
        <Text style={styles.note}>
          Making a song is selling, so it takes a 1,000 VBEATS stake — stake on the web (Profile → Stake 1,000 VBEATS to sell). Nothing is blocked until staking goes live after the stake contract is deployed.
        </Text>
        <Button
          title={beatLoading ? 'Publishing…' : 'Publish song'}
          onPress={handlePublish}
          style={styles.uploadButton}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16, marginBottom: 8 },
  subtitle: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  section: { marginBottom: 24 },
  dimmed: { opacity: 0.45 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  note: { color: '#aaa', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  label: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#333',
  },
  searchButton: { marginTop: 10 },
  resultRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultSub: { color: '#888', fontSize: 13, marginTop: 2 },
  parentCard: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#ff3d9a' },
  changeLink: { color: '#ff3d9a', fontSize: 13, marginTop: 8 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#1a1a1a', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#333',
  },
  chipOn: { backgroundColor: '#ff3d9a', borderColor: '#ff3d9a' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  recordButton: { flex: 1, backgroundColor: '#FF3B30', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  recordButtonActive: { backgroundColor: '#FF3B30', opacity: 0.8 },
  playButton: { flex: 1, backgroundColor: '#34C759', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  duration: { fontSize: 28, fontWeight: 'bold', color: '#ff3d9a', textAlign: 'center', marginTop: 12 },
  error: { color: '#FF3B30', fontSize: 12, marginTop: 8 },
  barGrid: { flexDirection: 'row', gap: 4, marginVertical: 10, flexWrap: 'wrap' },
  barCell: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  barCellOn: { backgroundColor: '#c77dff', borderColor: '#c77dff' },
  metroRow: { marginTop: 4, marginBottom: 8 },
  takeRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  takeActions: { flexDirection: 'row', gap: 16, marginTop: 6, flexWrap: 'wrap' },
  takeLink: { color: '#ff3d9a', fontSize: 13, fontWeight: '600' },
  uploadButton: { marginTop: 8 },
});

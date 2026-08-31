import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useBeats } from '../hooks/useBeats';
import Button from '../components/Button';

const GENRES = ['Hip-Hop', 'Trap', 'R&B', 'Pop', 'Electronic', 'Reggae', 'Other'];
const PRICES = [9.99, 19.99, 29.99, 49.99, 99.99];

export default function RecordBeatScreen({ navigation }: any) {
  const recorder = useAudioRecorder();
  const { create, loading: beatLoading } = useBeats();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [bpm, setBpm] = useState('');
  const [price, setPrice] = useState(PRICES[1].toString());
  const [showGenreMenu, setShowGenreMenu] = useState(false);
  const [showPriceMenu, setShowPriceMenu] = useState(false);

  useEffect(() => {
    recorder.initialize();
    return () => {
      recorder.cleanup();
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      await recorder.startRecording();
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      await recorder.stopRecording();
    } catch (err) {
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const handlePlayRecording = async () => {
    if (recorder.recordingData) {
      try {
        if (recorder.isPlaying) {
          await recorder.stop();
        } else {
          await recorder.play(recorder.recordingData.uri);
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to play recording');
      }
    }
  };

  const handleUploadBeat = async () => {
    if (!title) {
      Alert.alert('Error', 'Please enter a beat title');
      return;
    }

    if (!recorder.recordingData) {
      Alert.alert('Error', 'Please record a beat first');
      return;
    }

    try {
      await create(
        {
          title,
          description,
          genre,
          bpm: bpm ? parseInt(bpm) : undefined,
          price: parseFloat(price),
        },
        recorder.recordingData.uri
      );

      Alert.alert('Success', 'Beat uploaded successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Beats'),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to upload beat');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Record New Beat</Text>

      {/* Recording Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎤 Recording</Text>
        <View style={styles.recordingBox}>
          <Text style={styles.duration}>{recorder.durationFormatted}</Text>
          {recorder.error && <Text style={styles.error}>{recorder.error}</Text>}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              recorder.isRecording && styles.recordButtonActive,
            ]}
            onPress={recorder.isRecording ? handleStopRecording : handleStartRecording}
          >
            <Text style={styles.buttonText}>
              {recorder.isRecording ? '⏹️ Stop' : '⏺️ Record'}
            </Text>
          </TouchableOpacity>

          {recorder.recordingData && (
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayRecording}
            >
              <Text style={styles.buttonText}>
                {recorder.isPlaying ? '⏸️ Pause' : '▶️ Play'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Beat Details Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 Beat Details</Text>

        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Beat title"
          placeholderTextColor="#666"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe your beat"
          placeholderTextColor="#666"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Genre</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowGenreMenu(!showGenreMenu)}
        >
          <Text style={styles.dropdownText}>{genre}</Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
        {showGenreMenu && (
          <View style={styles.dropdownMenu}>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g}
                style={styles.menuItem}
                onPress={() => {
                  setGenre(g);
                  setShowGenreMenu(false);
                }}
              >
                <Text style={styles.menuText}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>BPM (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="120"
          placeholderTextColor="#666"
          value={bpm}
          onChangeText={setBpm}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Price</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowPriceMenu(!showPriceMenu)}
        >
          <Text style={styles.dropdownText}>${price}</Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
        {showPriceMenu && (
          <View style={styles.dropdownMenu}>
            {PRICES.map((p) => (
              <TouchableOpacity
                key={p}
                style={styles.menuItem}
                onPress={() => {
                  setPrice(p.toString());
                  setShowPriceMenu(false);
                }}
              >
                <Text style={styles.menuText}>${p.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Upload Section */}
      <View style={styles.section}>
        <Button
          title={beatLoading ? 'Uploading...' : 'Upload Beat'}
          onPress={handleUploadBeat}
          style={styles.uploadButton}
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  recordingBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  duration: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recordButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: '#FF3B30',
    opacity: 0.8,
  },
  playButton: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  dropdownButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  dropdownText: {
    color: '#fff',
    fontSize: 14,
  },
  dropdownArrow: {
    color: '#888',
    fontSize: 10,
  },
  dropdownMenu: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  menuText: {
    color: '#fff',
    fontSize: 14,
  },
  error: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 8,
  },
  uploadButton: {
    marginTop: 8,
  },
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useBeats } from '../hooks/useBeats';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import Button from '../components/Button';

export default function BeatDetailScreen({ route, navigation }: any) {
  const { beatId } = route.params;
  const { fetchBeat, currentBeat, loading, update, remove } = useBeats();
  const recorder = useAudioRecorder();
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchBeat(beatId);
    recorder.initialize();
    return () => recorder.cleanup();
  }, [beatId]);

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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          <Text style={styles.beatPrice}>${currentBeat.price}</Text>
        </View>

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

      <View style={styles.actions}>
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
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  editButton: {
    color: '#007AFF',
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
    color: '#34C759',
  },
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
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  playButtonActive: {
    backgroundColor: '#0051D5',
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

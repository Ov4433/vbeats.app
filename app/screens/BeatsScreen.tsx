import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useBeats } from '../hooks/useBeats';
import Card from '../components/Card';

export default function BeatsScreen({ navigation }: any) {
  const { beats, loading, error, fetchUserBeats } = useBeats();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchUserBeats();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUserBeats();
    setRefreshing(false);
  };

  const handleRecordBeat = () => {
    navigation.navigate('RecordBeat');
  };

  const handleBeatPress = (beatId: string) => {
    navigation.navigate('BeatDetail', { beatId });
  };

  if (loading && beats.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error && beats.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRefresh}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Beats</Text>
        <TouchableOpacity
          style={styles.recordButton}
          onPress={handleRecordBeat}
        >
          <Text style={styles.recordButtonText}>+ Record</Text>
        </TouchableOpacity>
      </View>

      {beats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎵</Text>
          <Text style={styles.emptyText}>No beats yet</Text>
          <Text style={styles.emptySubtext}>Create your first beat</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={handleRecordBeat}
          >
            <Text style={styles.emptyButtonText}>Start Recording</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={beats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleBeatPress(item.id)}
              activeOpacity={0.7}
            >
              <Card>
                <View style={styles.beatCard}>
                  <View style={styles.beatInfo}>
                    <Text style={styles.beatTitle}>{item.title}</Text>
                    <Text style={styles.beatGenre}>{item.genre}</Text>
                    <View style={styles.beatMeta}>
                      {item.bpm && (
                        <Text style={styles.beatMetaText}>♩ {item.bpm} BPM</Text>
                      )}
                      <Text style={styles.beatPrice}>${item.price}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.playButton}>
                    <Text style={styles.playButtonText}>▶️</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </TouchableOpacity>
          )}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          scrollEnabled
          nestedScrollEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 24,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  recordButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  beatCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  beatInfo: {
    flex: 1,
  },
  beatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  beatGenre: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  beatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  beatMetaText: {
    fontSize: 12,
    color: '#007AFF',
  },
  beatPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

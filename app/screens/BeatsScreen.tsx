import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function BeatsScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>My Beats</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No beats yet</Text>
        <Text style={styles.emptySubtext}>Create your first beat to get started</Text>
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
    marginBottom: 20,
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
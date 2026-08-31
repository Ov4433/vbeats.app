import { useState, useCallback } from 'react';
import {
  startRecording as audioStart,
  stopRecording as audioStop,
  getRecordingStatus,
  playAudio,
  pauseAudio,
  resumeAudio,
  stopAudio,
  unloadAudio,
  formatDuration,
  initializeAudio,
} from '../services/audioService';

export interface RecordingData {
  uri: string;
  duration: number;
  size: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordingData, setRecordingData] = useState<RecordingData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  const initialize = useCallback(async () => {
    try {
      setError(null);
      await initializeAudio();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize audio';
      setError(errorMsg);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      await audioStart();
      setIsRecording(true);
      setDuration(0);

      // Update duration every 100ms
      const interval = setInterval(async () => {
        const status = await getRecordingStatus();
        setDuration(status.duration);
      }, 100);

      return () => clearInterval(interval);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMsg);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      setError(null);
      const audio = await audioStop();
      setIsRecording(false);
      setRecordingData({
        uri: audio.uri,
        duration: audio.duration,
        size: audio.size,
      });
      return audio;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const play = useCallback(async (uri: string) => {
    try {
      setError(null);
      await playAudio(uri);
      setIsPlaying(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to play audio';
      setError(errorMsg);
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      setError(null);
      await pauseAudio();
      setIsPlaying(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to pause audio';
      setError(errorMsg);
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      setError(null);
      await resumeAudio();
      setIsPlaying(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resume audio';
      setError(errorMsg);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      setError(null);
      await stopAudio();
      setIsPlaying(false);
      setPlaybackPosition(0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop audio';
      setError(errorMsg);
    }
  }, []);

  const cleanup = useCallback(async () => {
    try {
      await unloadAudio();
      setIsRecording(false);
      setIsPlaying(false);
      setDuration(0);
      setPlaybackPosition(0);
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, []);

  return {
    isRecording,
    duration,
    durationFormatted: formatDuration(duration),
    error,
    recordingData,
    isPlaying,
    playbackPosition,
    initialize,
    startRecording,
    stopRecording,
    play,
    pause,
    resume,
    stop,
    cleanup,
  };
}

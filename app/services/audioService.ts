// Audio Recording Service for VbeatS
// Handles recording, playback, and audio file management

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface RecordingStatus {
  isRecording: boolean;
  duration: number;
  metering: number;
}

export interface AudioFile {
  uri: string;
  duration: number;
  size: number;
  mimeType: string;
}

let recording: Audio.Recording | null = null;
let sound: Audio.Sound | null = null;

/**
 * Initialize audio session
 */
export async function initializeAudio(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('Failed to initialize audio:', error);
    throw error;
  }
}

/**
 * Start recording audio
 */
export async function startRecording(): Promise<void> {
  try {
    if (recording) {
      console.warn('Recording already in progress');
      return;
    }

    const newRecording = new Audio.Recording();
    await newRecording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await newRecording.startAsync();
    recording = newRecording;
  } catch (error) {
    console.error('Failed to start recording:', error);
    throw error;
  }
}

/**
 * Stop recording and return audio file info
 */
export async function stopRecording(): Promise<AudioFile> {
  try {
    if (!recording) {
      throw new Error('No recording in progress');
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    if (!uri) {
      throw new Error('Failed to get recording URI');
    }

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const status = await recording.getStatusAsync();

    recording = null;

    return {
      uri,
      duration: status.durationMillis || 0,
      size: fileInfo.size || 0,
      mimeType: 'audio/m4a',
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}

/**
 * Get current recording status
 */
export async function getRecordingStatus(): Promise<RecordingStatus> {
  try {
    if (!recording) {
      return {
        isRecording: false,
        duration: 0,
        metering: -160,
      };
    }

    const status = await recording.getStatusAsync();
    return {
      isRecording: status.isRecording,
      duration: status.durationMillis || 0,
      metering: status.metering || -160,
    };
  } catch (error) {
    console.error('Failed to get recording status:', error);
    return {
      isRecording: false,
      duration: 0,
      metering: -160,
    };
  }
}

/**
 * Load and play audio file
 */
export async function playAudio(uri: string): Promise<void> {
  try {
    if (sound) {
      await sound.unloadAsync();
    }

    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true }
    );
    sound = newSound;
  } catch (error) {
    console.error('Failed to play audio:', error);
    throw error;
  }
}

/**
 * Pause audio playback
 */
export async function pauseAudio(): Promise<void> {
  try {
    if (sound) {
      await sound.pauseAsync();
    }
  } catch (error) {
    console.error('Failed to pause audio:', error);
  }
}

/**
 * Resume audio playback
 */
export async function resumeAudio(): Promise<void> {
  try {
    if (sound) {
      await sound.playAsync();
    }
  } catch (error) {
    console.error('Failed to resume audio:', error);
  }
}

/**
 * Stop audio playback
 */
export async function stopAudio(): Promise<void> {
  try {
    if (sound) {
      await sound.stopAsync();
    }
  } catch (error) {
    console.error('Failed to stop audio:', error);
  }
}

/**
 * Get playback status
 */
export async function getPlaybackStatus(): Promise<any> {
  try {
    if (!sound) {
      return null;
    }
    return await sound.getStatusAsync();
  } catch (error) {
    console.error('Failed to get playback status:', error);
    return null;
  }
}

/**
 * Unload all audio resources
 */
export async function unloadAudio(): Promise<void> {
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
    if (recording) {
      await recording.stopAndUnloadAsync();
      recording = null;
    }
  } catch (error) {
    console.error('Failed to unload audio:', error);
  }
}

/**
 * Delete audio file
 */
export async function deleteAudioFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri);
  } catch (error) {
    console.error('Failed to delete audio file:', error);
    throw error;
  }
}

/**
 * Format duration in milliseconds to MM:SS
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

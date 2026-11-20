import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { RecordingOptions } from 'expo-audio';
import type { Recording } from './notesApi';

type ExpoAudio = typeof import('expo-audio');

let audio: ExpoAudio | null | undefined;
/** expo-audio, loaded on first use (like the music player), or null in a build without it. */
function loadAudio(): ExpoAudio | null {
  if (audio !== undefined) return audio;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio') as ExpoAudio;
  } catch {
    audio = null;
  }
  return audio;
}

/**
 * Speech needs little: one channel at 32 kbit/s is about 15 MB an hour, so even a 2-hour recording stays under the
 * server's 50 MB limit (the presets use 128 kbit/s stereo, about 58 MB an hour).
 */
function recordingOptions(a: ExpoAudio): RecordingOptions {
  return {
    extension: '.m4a',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 32000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: {
      outputFormat: a.IOSOutputFormat.MPEG4AAC,
      audioQuality: a.AudioQuality.MEDIUM,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
  };
}

export type NoteRecorder = {
  /** False when this build cannot record. */
  available: boolean;
  recording: boolean;
  /** Length so far. */
  seconds: number;
  /** Asks for the microphone first. 'denied' when the person said no. */
  start(): Promise<'started' | 'denied'>;
  /** Stops and returns the recording, ready for uploadNote. */
  stop(): Promise<Recording | undefined>;
  /** Stops and throws the recording away. */
  cancel(): Promise<void>;
};

const unavailable: NoteRecorder = {
  available: false,
  recording: false,
  seconds: 0,
  start: async () => 'denied',
  stop: async () => undefined,
  cancel: async () => undefined,
};
const useUnavailable = () => unavailable;

function useExpoRecorder(): NoteRecorder {
  const a = loadAudio() as ExpoAudio;
  const [options] = useState(() => recordingOptions(a));
  const recorder = a.useAudioRecorder(options);
  const state = a.useAudioRecorderState(recorder, 500);
  const startedAt = useRef<Date | undefined>(undefined);

  const finish = async () => {
    const seconds = recorder.getStatus().durationMillis / 1000;
    await recorder.stop();
    // Back to playback only, so music and Svaraa's voice use the loudspeaker again.
    await a.setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    return seconds;
  };

  return {
    available: true,
    recording: state.isRecording,
    seconds: Math.floor(state.durationMillis / 1000),
    start: async () => {
      const permission = await a.requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      await a.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = new Date();
      return 'started';
    },
    stop: async () => {
      const durationSeconds = await finish();
      if (!recorder.uri) return undefined;
      return {
        uri: recorder.uri,
        mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
        durationSeconds,
        recordedAt: startedAt.current,
      };
    },
    cancel: async () => {
      if (recorder.getStatus().isRecording) await finish();
    },
  };
}

/**
 * Records a note with the phone's (or the browser's) microphone. Which version is used is fixed for the app's life,
 * so the hooks inside are always called in the same order.
 */
export function useNoteRecorder(): NoteRecorder {
  const impl = loadAudio() ? useExpoRecorder : useUnavailable;
  return impl();
}

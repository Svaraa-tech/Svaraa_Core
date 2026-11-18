import { create } from 'zustand';
import { getTrack, type Track } from '@/services/music/musicApi';

/** The little of expo-audio used here. Loaded on first use, so the tests (and a build without it) stay silent. */
interface Player {
  play(): void;
  pause(): void;
  replace(source: string): void;
  remove(): void;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (status: { didJustFinish?: boolean }) => void,
  ): {
    remove(): void;
  };
}
interface AudioApi {
  createAudioPlayer(source: string): Player;
  setAudioModeAsync(mode: { playsInSilentMode: boolean; shouldPlayInBackground?: boolean }): Promise<void>;
}

let api: AudioApi | null | undefined;
let player: Player | undefined;

function audio(): AudioApi | null {
  if (api !== undefined) return api;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require('expo-audio') as AudioApi;
    // Music is played on purpose: let it be heard when the phone's silent switch is on.
    void api
      .setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true })
      .catch(() => undefined);
  } catch {
    api = null;
  }
  return api;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

type State = {
  track?: Track;
  status: PlayerStatus;
  /** 'unplayable' = the song has no audio yet; otherwise an error from the server or the player. */
  error: unknown;
  play(track: Track): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
};

/** Error for a song the server has no audio for yet. */
export class NotPlayable extends Error {
  constructor() {
    super('This song is not playable yet');
    this.name = 'NotPlayable';
  }
}

/**
 * The Music app's player, on this phone (or browser). Before each song it asks the server for a fresh link
 * (GET /music/tracks/{id}), because the links expire after a few hours.
 * PENDING PENDANT: the wireframes play music on the pendant; for now it plays on the phone.
 */
export const useMusicPlayer = create<State>((set, get) => ({
  status: 'idle',
  error: null,
  play: async (track) => {
    set({ track, status: 'loading', error: null });
    try {
      const fresh = await getTrack(track.id);
      if (get().track?.id !== track.id) return; // another song was picked meanwhile
      if (!fresh.stream_url) throw new NotPlayable();
      const a = audio();
      if (!a) throw new Error('Audio is not available in this build');
      if (player) player.replace(fresh.stream_url);
      else {
        player = a.createAudioPlayer(fresh.stream_url);
        player.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish) set({ status: 'idle' });
        });
      }
      player.play();
      set({ track: fresh, status: 'playing' });
    } catch (error) {
      if (get().track?.id === track.id) set({ status: 'idle', error });
    }
  },
  pause: () => {
    player?.pause();
    if (get().status === 'playing') set({ status: 'paused' });
  },
  resume: () => {
    if (!player || get().status !== 'paused') return;
    player.play();
    set({ status: 'playing' });
  },
  stop: () => {
    player?.pause();
    set({ track: undefined, status: 'idle', error: null });
  },
}));

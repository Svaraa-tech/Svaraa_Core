import { create } from 'zustand';
import { useOpenApp } from '@/features/apps/openApp';
import { useMusicPlayer } from './player';
import { pauseSpotifyForApp } from './spotifyPause';
import { YOUTUBE_VIDEOS, youtubeById } from './youtubeCatalog';

type MusicSource = 'songs' | 'spotify' | 'youtube';

type State = {
  /** Selected / playing curated video, or null when stopped. */
  activeId: string | null;
  /** Music tab to show; chat bumps this to youtube on play. */
  source: MusicSource;
  setSource: (source: MusicSource) => void;
  play: (videoId: string) => void;
  stop: () => void;
  pause: () => void;
  next: () => void;
};

/** Only one player at a time: a YouTube video is starting, so Svaraa's songs stop and Spotify pauses. */
function takeOverFromOthers() {
  useMusicPlayer.getState().stop();
  void pauseSpotifyForApp();
}

function openMusicApp() {
  useOpenApp.getState().setOpen('music');
  void import('expo-router')
    .then(({ router }) => {
      router.navigate('/apps');
    })
    .catch(() => {
      /* jest / no navigation tree */
    });
}

/** Shared YouTube + Music-tab state so chat can play curated embeds like music events. */
export const useYouTubePlayer = create<State>((set, get) => ({
  activeId: null,
  source: 'songs',
  setSource: (source) => set({ source }),
  play: (videoId) => {
    if (!youtubeById(videoId)) return;
    takeOverFromOthers();
    set({ activeId: videoId, source: 'youtube' });
    openMusicApp();
  },
  stop: () => set({ activeId: null }),
  pause: () => set({ activeId: null }),
  next: () => {
    const list = YOUTUBE_VIDEOS;
    if (!list.length) return;
    const cur = get().activeId;
    const i = cur ? list.findIndex((v) => v.id === cur) : -1;
    const next = list[(i + 1) % list.length];
    takeOverFromOthers();
    set({ activeId: next.id, source: 'youtube' });
    openMusicApp();
  },
}));

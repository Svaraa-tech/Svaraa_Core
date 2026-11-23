/**
 * Only one player plays at a time: Svaraa's own songs, the YouTube collection, or the user's Spotify.
 * Requests made by voice or chat are kept apart by the server (contract 8.3). Taps in the app are ours (contract 8.4).
 */
import { queryClient } from '@/services/queryClient';
import {
  SPOTIFY_NOW_KEY,
  SPOTIFY_STATUS_KEY,
  getSpotifyStatus,
  sendPlayerCommand,
} from '@/services/spotify/spotifyApi';
import { useMusicPlayer } from './player';
import { useYouTubePlayer } from './youtubePlayer';

/** Stop the app's own players (Svaraa's songs and YouTube) before Spotify plays. */
export function stopAppPlayers(): void {
  useMusicPlayer.getState().stop();
  useYouTubePlayer.getState().stop();
}

/**
 * Pause the user's Spotify before an app player starts. Does nothing when Spotify is not connected, and never throws:
 * a Spotify problem must not stop Svaraa's own music from playing.
 */
export async function pauseSpotifyForApp(): Promise<void> {
  try {
    const status = await queryClient.fetchQuery({
      queryKey: SPOTIFY_STATUS_KEY,
      queryFn: getSpotifyStatus,
      staleTime: 60_000,
    });
    if (!status.connected) return;
    const now = await sendPlayerCommand('pause');
    queryClient.setQueryData(SPOTIFY_NOW_KEY, now);
  } catch {
    /* not connected, no open device, offline: nothing to pause */
  }
}

/** Svaraa started a song on Spotify (a `spotify` event): the app's players stop and the Spotify bar refreshes. */
export function onSpotifyStarted(): void {
  stopAppPlayers();
  void queryClient.invalidateQueries({ queryKey: SPOTIFY_NOW_KEY });
}

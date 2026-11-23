/**
 * Only one player plays at a time: Svaraa's own songs, the YouTube collection, or the user's Spotify.
 * Requests made by voice or chat are kept apart by the server (contract 8.3). Taps in the app are ours (contract 8.4).
 */
import { queryClient } from '@/services/queryClient';
import { SPOTIFY_NOW_KEY } from '@/services/spotify/spotifyApi';
import { useMusicPlayer } from './player';
import { pauseSpotifyForApp } from './spotifyPause';
import { useYouTubePlayer } from './youtubePlayer';

export { pauseSpotifyForApp };

/** Stop the app's own players (Svaraa's songs and YouTube) before Spotify plays. */
export function stopAppPlayers(): void {
  useMusicPlayer.getState().stop();
  useYouTubePlayer.getState().stop();
}

/** Svaraa started a song on Spotify (a `spotify` event): the app's players stop and the Spotify bar refreshes. */
export function onSpotifyStarted(): void {
  stopAppPlayers();
  void queryClient.invalidateQueries({ queryKey: SPOTIFY_NOW_KEY });
}

/** Svaraa's own song is about to play (a tap): stop YouTube and pause Spotify. */
export function beginSvaraaSong(): void {
  useYouTubePlayer.getState().stop();
  void pauseSpotifyForApp();
}

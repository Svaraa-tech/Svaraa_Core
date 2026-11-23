import { queryClient } from '@/services/queryClient';
import {
  SPOTIFY_NOW_KEY,
  SPOTIFY_STATUS_KEY,
  getSpotifyStatus,
  sendPlayerCommand,
} from '@/services/spotify/spotifyApi';

/**
 * Pause the user's Spotify before an app player starts. Does nothing when Spotify is not connected, and never throws:
 * a Spotify problem must not stop Svaraa's own music or YouTube from playing.
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

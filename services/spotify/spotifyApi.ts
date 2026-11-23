import { Platform } from 'react-native';
import { api, call, type components } from '@/services/api';

type S = components['schemas'];

/**
 * Spotify on the real backend (flags.spotifyApi). Spotify is linked to the signed-in person, so any phone or the web
 * app can use it: no install id. Browsing (recent, top, liked, playlists, search) and playing need sign-in only.
 */
export type SpotifyStatus = S['StatusOut'];
export type SpotifyDevice = S['app__api__v1__spotify__DeviceOut'];
export type NowPlaying = S['NowPlayingOut'];
export type PlayerAction = S['PlayerIn']['action'];
/** A song, album, artist or playlist card. */
export type MediaItem = S['MediaItemOut'];
export type MediaPage = S['MediaPageOut'];
export type SpotifySearch = S['SearchOut'];
export type TopRange = 'short_term' | 'medium_term' | 'long_term';

/** Songs per page for every list (the server's default for lists is 20). */
export const PAGE_SIZE = 20;

/** Query keys shared by the Spotify tab and by chat/voice events that start music. */
export const SPOTIFY_STATUS_KEY = ['spotify', 'status'] as const;
export const SPOTIFY_NOW_KEY = ['spotify', 'now-playing'] as const;

/** The link that opens Spotify's own sign-in page. Valid 10 minutes, single use: ask for a new one each time. */
export async function getLoginUrl(): Promise<string> {
  // `client` tells the server where to send the person after sign-in: back to the app (deep link) or the web app.
  const out = await call(
    api.POST('/api/v1/spotify/login-url', { body: { client: Platform.OS === 'web' ? 'web' : 'app' } }),
  );
  return out.url;
}

/** Is Spotify connected? Also the account name, plan ("premium" is needed to play) and devices that are open. */
export const getSpotifyStatus = (): Promise<SpotifyStatus> => call(api.GET('/api/v1/spotify/status'));

/** What is playing now, for the mini player. */
export const getNowPlaying = (): Promise<NowPlaying> => call(api.GET('/api/v1/spotify/now-playing'));

/** Play (resume), pause, skip or set the volume. Returns the player after the change. */
export const sendPlayerCommand = (action: PlayerAction, volumePercent?: number): Promise<NowPlaying> =>
  call(
    api.POST('/api/v1/spotify/player', {
      body: { action, volume_percent: action === 'volume' ? volumePercent : undefined },
    }),
  );

/** Disconnect Spotify. */
export async function disconnectSpotify(): Promise<void> {
  await call(api.DELETE('/api/v1/spotify/link'));
}

/** Songs played recently, newest first. */
export const getRecent = (): Promise<MediaPage> =>
  call(api.GET('/api/v1/spotify/recent', { params: { query: { limit: PAGE_SIZE } } }));

/** The most played songs. */
export const getTop = (range: TopRange = 'medium_term'): Promise<MediaPage> =>
  call(api.GET('/api/v1/spotify/top', { params: { query: { limit: PAGE_SIZE, time_range: range } } }));

/** Liked songs, newest first. `offset` comes from the last page's `next_offset`. */
export const getLiked = (offset = 0): Promise<MediaPage> =>
  call(api.GET('/api/v1/spotify/liked', { params: { query: { limit: PAGE_SIZE, offset } } }));

/** The person's playlists (made or followed). */
export const getPlaylists = (offset = 0): Promise<MediaPage> =>
  call(api.GET('/api/v1/spotify/playlists', { params: { query: { limit: PAGE_SIZE, offset } } }));

/**
 * Songs in a playlist. Spotify only lists playlists the person made or shares: for others the server answers
 * `403 spotify_playlist_not_listable`; play those as a whole with `playItem`.
 */
export const getPlaylistTracks = (playlistId: string, offset = 0): Promise<MediaPage> =>
  call(
    api.GET('/api/v1/spotify/playlists/{playlist_id}/tracks', {
      params: { path: { playlist_id: playlistId }, query: { limit: PAGE_SIZE, offset } },
    }),
  );

/** Songs of an album. */
export const getAlbumTracks = (albumId: string, offset = 0): Promise<MediaPage> =>
  call(
    api.GET('/api/v1/spotify/albums/{album_id}/tracks', {
      params: { path: { album_id: albumId }, query: { limit: PAGE_SIZE, offset } },
    }),
  );

/** Search all of Spotify: songs, artists, albums and playlists. */
export const searchSpotify = (q: string): Promise<SpotifySearch> =>
  call(api.GET('/api/v1/spotify/search', { params: { query: { q, limit: 10 } } }));

/**
 * Play a card on the person's active Spotify device (or their phone if none is active). A song tapped inside a
 * playlist or album: pass the song as `uri` and the playlist or album as `contextUri`.
 */
export const playItem = (uri: string, contextUri?: string): Promise<NowPlaying> =>
  call(api.POST('/api/v1/spotify/play', { body: { uri, context_uri: contextUri ?? null } }));

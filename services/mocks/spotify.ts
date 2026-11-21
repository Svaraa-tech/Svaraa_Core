import type { components } from '@/services/api/schema';
import type { MockSpotify } from './db';

type S = components['schemas'];
type Track = S['TrackNowOut'];
type Device = S['app__api__v1__spotify__DeviceOut'];

/** PENDING BACKEND: a stand-in for Spotify. The mock has no real account, so asking for the login link connects. */
const TRACKS: Track[] = [
  {
    name: 'Lag Jaa Gale',
    artists: 'Lata Mangeshkar',
    album: 'Woh Kaun Thi?',
    image_url: null,
    duration_ms: 270_000,
  },
  {
    name: 'Lead Kindly Light',
    artists: 'M. S. Subbulakshmi',
    album: 'Sample album',
    image_url: null,
    duration_ms: 240_000,
  },
];

const DEVICE: Device = { name: 'Sample phone', type: 'Smartphone', is_active: true };

export const loginUrl = () => 'https://accounts.spotify.com/authorize?mock=1';

export function status(link: MockSpotify): S['StatusOut'] {
  return link.connected
    ? {
        connected: true,
        needs_reconnect: false,
        display_name: 'Sample listener',
        product: 'premium',
        devices: [DEVICE],
      }
    : { connected: false, needs_reconnect: false, display_name: null, product: null, devices: [] };
}

export function nowPlaying(link: MockSpotify): S['NowPlayingOut'] {
  return {
    is_playing: link.playing,
    track: TRACKS[link.index % TRACKS.length],
    progress_ms: 30_000,
    device: DEVICE,
    volume_percent: link.volume,
  };
}

/** POST /spotify/player: apply the button. Undefined = 422 (volume without a number). */
export function command(link: MockSpotify, body: Partial<S['PlayerIn']>): S['NowPlayingOut'] | undefined {
  switch (body.action) {
    case 'play':
      link.playing = true;
      break;
    case 'pause':
      link.playing = false;
      break;
    case 'next':
      link.index = (link.index + 1) % TRACKS.length;
      break;
    case 'previous':
      link.index = (link.index + TRACKS.length - 1) % TRACKS.length;
      break;
    case 'volume':
      if (typeof body.volume_percent !== 'number') return undefined;
      link.volume = body.volume_percent;
      break;
    default:
      return undefined;
  }
  return nowPlaying(link);
}

type Item = S['MediaItemOut'];
const track = (n: number, t: Track): Item => ({
  kind: 'track',
  id: `t${n}`,
  uri: `spotify:track:t${n}`,
  name: t.name,
  subtitle: t.artists,
  image_url: null,
  duration_ms: t.duration_ms ?? null,
  track_count: null,
  played_at: null,
});
const SONGS: Item[] = TRACKS.map((t, i) => track(i + 1, t));
const PLAYLIST: Item = {
  kind: 'playlist',
  id: 'pl1',
  uri: 'spotify:playlist:pl1',
  name: 'Morning bhajans',
  subtitle: 'Sample listener',
  image_url: null,
  duration_ms: null,
  track_count: SONGS.length,
  played_at: null,
};
/** A playlist made by someone else: the server cannot list its songs (403 spotify_playlist_not_listable). */
export const FOREIGN_PLAYLIST_ID = 'foreign';
const FOREIGN: Item = {
  ...PLAYLIST,
  id: FOREIGN_PLAYLIST_ID,
  uri: 'spotify:playlist:foreign',
  name: 'Radio hits',
};
const ALBUM: Item = {
  kind: 'album',
  id: 'al1',
  uri: 'spotify:album:al1',
  name: 'Woh Kaun Thi?',
  subtitle: 'Lata Mangeshkar',
  image_url: null,
  duration_ms: null,
  track_count: SONGS.length,
  played_at: null,
};

const page = (items: Item[], query: URLSearchParams | undefined): S['MediaPageOut'] => {
  const offset = Math.max(0, Number(query?.get('offset')) || 0);
  const limit = Math.max(1, Number(query?.get('limit')) || 20);
  const next = offset + limit;
  return { items: items.slice(offset, next), next_offset: next < items.length ? next : null };
};

export const recent = (q?: URLSearchParams) => page(SONGS, q);
export const top = (q?: URLSearchParams) => page([...SONGS].reverse(), q);
export const liked = (q?: URLSearchParams) => page(SONGS, q);
export const playlists = (q?: URLSearchParams) => page([PLAYLIST, FOREIGN], q);
/** Undefined = not listable (403) for the other person's playlist. */
export const playlistTracks = (id: string, q?: URLSearchParams) =>
  id === FOREIGN_PLAYLIST_ID ? undefined : page(SONGS, q);
export const albumTracks = (q?: URLSearchParams) => page(SONGS, q);

/** GET /spotify/search: every kind whose name or subtitle has the words. Undefined = 422 (no words). */
export function search(q: string | null | undefined): S['SearchOut'] | undefined {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  const hit = (m: Item) => words.every((w) => `${m.name} ${m.subtitle ?? ''}`.toLowerCase().includes(w));
  return {
    tracks: SONGS.filter(hit),
    artists: [],
    albums: [ALBUM].filter(hit),
    playlists: [PLAYLIST, FOREIGN].filter(hit),
  };
}

/** POST /spotify/play: a song starts that song; any other card just starts playing. */
export function playUri(link: MockSpotify, uri: string): S['NowPlayingOut'] {
  const at = SONGS.findIndex((m) => m.uri === uri);
  if (at >= 0) link.index = at;
  link.playing = true;
  return nowPlaying(link);
}

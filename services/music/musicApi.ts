import { api, call, type components } from '@/services/api';

type S = components['schemas'];

/**
 * The music catalog on the real backend (flags.musicApi): old film songs and bhajans. Needs sign-in.
 * A track's `stream_url` is a temporary link (a few hours): ask for the track again right before playing it.
 */
export type Track = S['TrackOut'];
export type TrackCategory = S['TrackCategory'];

export const TRACK_CATEGORIES: TrackCategory[] = ['old_song', 'bhajan'];
/** Songs per list (the server's default). */
export const TRACK_LIMIT = 50;

/** List or search the catalog. `q` matches the title (English or Hindi), the singer or the film. */
export const listTracks = (filter: { category?: TrackCategory; q?: string } = {}): Promise<Track[]> =>
  call(
    api.GET('/api/v1/music/tracks', {
      params: {
        query: {
          category: filter.category,
          q: filter.q?.trim() || undefined,
          limit: TRACK_LIMIT,
        },
      },
    }),
  );

/** One track with a fresh `stream_url` (null when the song is not playable yet). */
export const getTrack = (trackId: string): Promise<Track> =>
  call(api.GET('/api/v1/music/tracks/{track_id}', { params: { path: { track_id: trackId } } }));

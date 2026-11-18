import type { components } from '@/services/api/schema';

type S = components['schemas'];
type Track = S['TrackOut'];

/**
 * A small sample catalog for the mock backend. Titles are of well-known public-domain or traditional works; the mock
 * has no audio, so `stream_url` is null ("not playable yet") and the player says so.
 */
const TRACKS: Track[] = [
  {
    id: '00000000-0000-4000-9000-000000000001',
    title: 'Raghupati Raghav Raja Ram',
    title_hi: 'रघुपति राघव राजा राम',
    artist: null,
    film: null,
    year: null,
    category: 'bhajan',
    tags: ['morning', 'devotional'],
    stream_url: null,
  },
  {
    id: '00000000-0000-4000-9000-000000000002',
    title: 'Vaishnav Jan To',
    title_hi: 'वैष्णव जन तो',
    artist: null,
    film: null,
    year: null,
    category: 'bhajan',
    tags: ['devotional'],
    stream_url: null,
  },
  {
    id: '00000000-0000-4000-9000-000000000003',
    title: 'Sample old song: Evening melody',
    title_hi: 'नमूना पुराना गाना: शाम की धुन',
    artist: 'Sample Singer',
    film: 'Sample Film',
    year: 1962,
    category: 'old_song',
    tags: ['classic'],
    stream_url: null,
  },
  {
    id: '00000000-0000-4000-9000-000000000004',
    title: 'Sample old song: Monsoon memories',
    title_hi: 'नमूना पुराना गाना: बरसात की यादें',
    artist: 'Sample Singer',
    film: 'Another Sample Film',
    year: 1971,
    category: 'old_song',
    tags: ['classic'],
    stream_url: null,
  },
];

const CATEGORIES = new Set<string>(['old_song', 'bhajan']);

/** GET /music/tracks: filter by category and words (title in either language, singer, film). Undefined = 422. */
export function listTracks(query: URLSearchParams | undefined): Track[] | undefined {
  const category = query?.get('category');
  if (category && !CATEGORIES.has(category)) return undefined;
  const words = (query?.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(200, Math.max(1, Number(query?.get('limit')) || 50));
  return TRACKS.filter(
    (t) =>
      (!category || t.category === category) &&
      words.every((w) =>
        [t.title, t.title_hi, t.artist, t.film].filter(Boolean).join(' ').toLowerCase().includes(w),
      ),
  ).slice(0, limit);
}

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

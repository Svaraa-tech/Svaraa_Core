/**
 * PENDING BACKEND: a "play X on Spotify" phrase → the events the real server sends (contract 8.3): the app's own
 * player stops, then a `spotify` event says what started. Mirrors backend spotify_tool when it is not available.
 */
import i18n from '@/i18n';
import type { components } from '@/services/api/schema';

type ChatResponse = components['schemas']['ChatResponse'];
type Parsed = { response: string; events: ChatResponse['events'] };

export function mockSpotifyChat(message: string): Parsed | null {
  const match = /^\s*(?:play\s+)?(.+?)\s+(?:on|in)\s+spotify\s*$/i.exec(message);
  const name = match?.[1]?.trim();
  if (!name) return null;
  return {
    response: i18n.t('chat.mock.spotify.playing', { title: name }),
    events: [
      { type: 'music', action: 'stop' },
      {
        type: 'spotify',
        action: 'play',
        item: { kind: 'track', name, subtitle: null, uri: 'spotify:track:mock', image_url: null },
      },
    ],
  };
}

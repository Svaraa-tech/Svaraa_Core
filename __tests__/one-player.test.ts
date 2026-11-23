import i18n from '@/i18n';
import { beginSvaraaSong, pauseSpotifyForApp } from '@/features/music/onePlayer';
import { useMusicPlayer } from '@/features/music/player';
import { useYouTubePlayer } from '@/features/music/youtubePlayer';
import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { applyChatEvents } from '@/services/chat/applyChatEvents';
import { askSvaraa } from '@/services/chat/chatApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import { queryClient } from '@/services/queryClient';
import {
  SPOTIFY_NOW_KEY,
  getLoginUrl,
  getNowPlaying,
  sendPlayerCommand,
} from '@/services/spotify/spotifyApi';
import { INDIA, calls, requests, useMockBackend } from '@/test-utils/backend';

jest.mock('@/services/spotify/openLogin', () => ({ openSpotifyLogin: jest.fn(async () => undefined) }));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await useMockBackend();
  await verifyOtpAndSignIn(INDIA, DEMO_CODE);
  queryClient.clear();
  useYouTubePlayer.setState({ activeId: null, source: 'songs' });
});

describe('one player at a time', () => {
  it('a spotify event stops the YouTube player and refreshes the Spotify bar', async () => {
    useYouTubePlayer.setState({ activeId: 'abc', source: 'youtube' });
    queryClient.setQueryData(SPOTIFY_NOW_KEY, { is_playing: false });
    await applyChatEvents([
      { type: 'music', action: 'stop' },
      {
        type: 'spotify',
        action: 'play',
        item: { kind: 'track', name: 'Ek Din Aap', uri: 'spotify:track:1' },
      },
    ]);
    expect(useYouTubePlayer.getState().activeId).toBeNull();
    expect(useMusicPlayer.getState().status).toBe('idle');
    expect(queryClient.getQueryState(SPOTIFY_NOW_KEY)?.isInvalidated).toBe(true);
  });

  it('ignores a spotify event with an action it does not know', async () => {
    useYouTubePlayer.setState({ activeId: 'abc', source: 'youtube' });
    await applyChatEvents([{ type: 'spotify', action: 'sing' }, { type: 'something-new' }]);
    expect(useYouTubePlayer.getState().activeId).toBe('abc');
  });

  it('asking the mock chat for a song on Spotify sends music stop, then the spotify event', async () => {
    useYouTubePlayer.setState({ activeId: 'abc', source: 'youtube' });
    const out = await askSvaraa('Play Ek Din Aap on Spotify');
    expect(out.events?.map((e) => `${e.type}:${e.action}`)).toEqual(['music:stop', 'spotify:play']);
    expect(useYouTubePlayer.getState().activeId).toBeNull();
    expect(out.text).toMatch(/Ek Din Aap/);
  });

  it("tapping Svaraa's own song pauses Spotify when it is connected and playing", async () => {
    await getLoginUrl(); // connects the mock account
    await sendPlayerCommand('play');
    expect((await getNowPlaying()).is_playing).toBe(true);
    await pauseSpotifyForApp();
    expect((await getNowPlaying()).is_playing).toBe(false);
  });

  it('does nothing, and does not throw, when Spotify is not connected', async () => {
    const before = calls('/api/v1/spotify/player');
    await expect(pauseSpotifyForApp()).resolves.toBeUndefined();
    expect(calls('/api/v1/spotify/player')).toBe(before);
    expect(requests.some((r) => r.path === '/api/v1/spotify/status')).toBe(true);
  });

  it("starting a YouTube video stops Svaraa's song and pauses Spotify", async () => {
    await getLoginUrl();
    await sendPlayerCommand('play');
    useMusicPlayer.setState({ status: 'playing', track: { id: 't1' } as never });
    useYouTubePlayer.getState().play('GvtLszZkXsk');
    await new Promise((r) => setTimeout(r, 50));
    expect(useMusicPlayer.getState().status).toBe('idle');
    expect((await getNowPlaying()).is_playing).toBe(false);
    expect(useYouTubePlayer.getState().activeId).toBe('GvtLszZkXsk');
  });

  it("starting Svaraa's song stops YouTube and pauses Spotify", async () => {
    await getLoginUrl();
    await sendPlayerCommand('play');
    useYouTubePlayer.setState({ activeId: 'GvtLszZkXsk', source: 'youtube' });
    beginSvaraaSong();
    await new Promise((r) => setTimeout(r, 50));
    expect(useYouTubePlayer.getState().activeId).toBeNull();
    expect((await getNowPlaying()).is_playing).toBe(false);
  });

  it("a chat 'music play' event stops YouTube", async () => {
    useYouTubePlayer.setState({ activeId: 'GvtLszZkXsk', source: 'youtube' });
    await applyChatEvents([{ type: 'music', action: 'resume' }]);
    expect(useYouTubePlayer.getState().activeId).toBeNull();
  });
});

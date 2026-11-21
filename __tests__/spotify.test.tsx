import { fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { MusicView } from '@/features/music/MusicView';
import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import {
  disconnectSpotify,
  getLiked,
  getLoginUrl,
  getNowPlaying,
  getPlaylists,
  getPlaylistTracks,
  getSpotifyStatus,
  playItem,
  searchSpotify,
  sendPlayerCommand,
} from '@/services/spotify/spotifyApi';
import { INDIA, requests, useMockBackend } from '@/test-utils/backend';
import { renderApp } from '@/test-utils/render';

jest.mock('@/services/spotify/openLogin', () => ({ openSpotifyLogin: jest.fn(async () => undefined) }));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await useMockBackend();
  await verifyOtpAndSignIn(INDIA, DEMO_CODE);
});

describe('Spotify service', () => {
  it('starts disconnected, connects through the login link, plays and disconnects', async () => {
    expect((await getSpotifyStatus()).connected).toBe(false);
    expect(await getLoginUrl()).toMatch(/^https:\/\/accounts\.spotify\.com\//);
    expect(requests.some((r) => r.path === '/api/v1/spotify/login-url')).toBe(true);
    const status = await getSpotifyStatus();
    expect(status.connected).toBe(true);
    expect(status.product).toBe('premium');
    expect((await sendPlayerCommand('play')).is_playing).toBe(true);
    expect((await sendPlayerCommand('volume', 30)).volume_percent).toBe(30);
    expect((await getNowPlaying()).track?.name).toBeTruthy();
    await disconnectSpotify();
    expect((await getSpotifyStatus()).connected).toBe(false);
  });
});

describe('Spotify browse service', () => {
  it("lists the library, searches, plays a card, and refuses to list a playlist that is not the person's", async () => {
    await getLoginUrl();
    expect((await getLiked()).items.length).toBe(2);
    const lists = await getPlaylists();
    expect(lists.items.map((m) => m.name)).toEqual(['Morning bhajans', 'Radio hits']);
    expect((await getPlaylistTracks('pl1')).items.length).toBe(2);
    await expect(getPlaylistTracks('foreign')).rejects.toMatchObject({
      code: 'spotify_playlist_not_listable',
    });
    expect((await searchSpotify('lata')).tracks.map((m) => m.name)).toEqual(['Lag Jaa Gale']);
    const out = await playItem('spotify:track:t2', 'spotify:playlist:pl1');
    expect(out.is_playing).toBe(true);
    expect(out.track?.name).toBe('Lead Kindly Light');
  });

  it('answers 409 until Spotify is connected', async () => {
    await expect(getLiked()).rejects.toBeTruthy();
  });
});

describe('Spotify tab', () => {
  it('offers Connect, then shows what is playing and the player buttons', async () => {
    await renderApp(<MusicView />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Spotify' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Connect Spotify' }));
    expect(await screen.findByText('Now playing on Spotify')).toBeTruthy();
    expect((await screen.findAllByText('Lag Jaa Gale')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect((await screen.findAllByText('Lead Kindly Light')).length).toBeGreaterThan(0);
  });

  it('disconnects back to the Connect button', async () => {
    await renderApp(<MusicView />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Spotify' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Connect Spotify' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect Spotify' }));
    expect(await screen.findByRole('button', { name: 'Connect Spotify' })).toBeTruthy();
  });

  it('browses the library, opens a playlist and plays a song from it', async () => {
    await renderApp(<MusicView />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Spotify' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Connect Spotify' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Playlists' }));
    await fireEvent.press(await screen.findByText('Morning bhajans'));
    expect(await screen.findByRole('button', { name: 'Play all' })).toBeTruthy();
    await fireEvent.press(await screen.findByText('Lead Kindly Light'));
    expect(requests.some((r) => r.path === '/api/v1/spotify/play')).toBe(true);
  });

  it('says so when Spotify does not list a playlist, and still offers Play all', async () => {
    await renderApp(<MusicView />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Spotify' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Connect Spotify' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Playlists' }));
    await fireEvent.press(await screen.findByText('Radio hits'));
    expect(await screen.findByText(/does not let us list the songs/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play all' })).toBeTruthy();
  });
});

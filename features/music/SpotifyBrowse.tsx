import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/features/auth/useErrorText';
import { InfoRow, Pill, useMainPalette } from '@/features/main/palette';
import { toApiError } from '@/services/api';
import {
  getAlbumTracks,
  getLiked,
  getPlaylists,
  getPlaylistTracks,
  getRecent,
  getTop,
  searchSpotify,
  type MediaItem,
  type MediaPage,
} from '@/services/spotify/spotifyApi';
import { Button, Choice, Input, Text, useTheme } from '@/ui';

type Section = 'recent' | 'top' | 'liked' | 'playlists';
const SECTIONS: Section[] = ['recent', 'top', 'liked', 'playlists'];
const SEARCH_DELAY_MS = 500;
const MIN_SEARCH_LENGTH = 2;

type Page = Promise<MediaPage>;

/** Plays a card. `context` is the album or playlist a song was tapped in. */
export type PlayFn = (uri: string, context?: string) => void;

const fetchSection = (section: Section, offset: number): Page =>
  section === 'recent'
    ? getRecent()
    : section === 'top'
      ? getTop()
      : section === 'liked'
        ? getLiked(offset)
        : getPlaylists(offset);

/** A list of cards from the server, with "Show more" when the server says there are more (`next_offset`). */
function useCards(key: readonly unknown[], load: (offset: number) => Page, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    enabled,
    staleTime: 60_000,
  });
  return { q, items: q.data?.pages.flatMap((pg) => pg.items) ?? [] };
}

function Cards({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const { t } = useTranslation();
  return (
    <>
      {items.map((m, i) => (
        <InfoRow
          key={`${m.uri}-${i}`}
          title={m.name}
          detail={m.subtitle ?? undefined}
          right={m.kind === 'track' ? undefined : <Pill label={t(`music.spotify.kind.${m.kind}`)} />}
          onPress={() => onOpen(m)}
        />
      ))}
    </>
  );
}

function Status({
  q,
  count,
  emptyKey,
}: {
  q: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  count: number;
  emptyKey: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const errorText = useErrorText();
  if (q.isPending) return <ActivityIndicator color={p.plum} />;
  if (q.isError)
    return (
      <View style={{ gap: theme.space[2] }}>
        <Text tone="safety" accessibilityRole="alert">
          {errorText(q.error)}
        </Text>
        <Button label={t('music.retry')} variant="secondary" onPress={() => void q.refetch()} fullWidth />
      </View>
    );
  return count ? null : <Text style={{ color: p.muted }}>{t(emptyKey)}</Text>;
}

/** The songs of one album or playlist. A playlist the person does not own cannot be listed: it can still be played. */
function Tracks({ item, onBack, onPlay }: { item: MediaItem; onBack: () => void; onPlay: PlayFn }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const errorText = useErrorText();
  const { q, items } = useCards(['spotify', 'tracks', item.kind, item.id], (offset) =>
    item.kind === 'playlist' ? getPlaylistTracks(item.id, offset) : getAlbumTracks(item.id, offset),
  );
  const notListable = q.isError && toApiError(q.error).code === 'spotify_playlist_not_listable';
  return (
    <View style={{ gap: theme.space[3] }}>
      <Button label={t('music.spotify.back')} variant="tertiary" onPress={onBack} />
      <Text style={{ color: p.ink, fontWeight: '700' }}>{item.name}</Text>
      {item.subtitle ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {item.subtitle}
        </Text>
      ) : null}
      <Button label={t('music.spotify.playAll')} onPress={() => onPlay(item.uri)} fullWidth />
      {notListable ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('music.spotify.notListable')}
        </Text>
      ) : q.isError ? (
        <Text tone="safety" accessibilityRole="alert">
          {errorText(q.error)}
        </Text>
      ) : null}
      {notListable ? null : <Status q={q} count={items.length} emptyKey="music.spotify.noTracks" />}
      <Cards items={items} onOpen={(m) => onPlay(m.uri, item.uri)} />
      {q.hasNextPage ? (
        <Button
          label={t('music.spotify.more')}
          variant="secondary"
          onPress={() => void q.fetchNextPage()}
          loading={q.isFetchingNextPage}
          fullWidth
        />
      ) : null}
    </View>
  );
}

/** Spotify's library for the signed-in person (recent, most played, liked, playlists) and a search over all of Spotify. */
export function SpotifyBrowse({ onPlay }: { onPlay: PlayFn }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const errorText = useErrorText();
  const [section, setSection] = useState<Section>('recent');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<MediaItem | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = search.length >= MIN_SEARCH_LENGTH;
  const found = useQuery({
    queryKey: ['spotify', 'search', search],
    queryFn: () => searchSpotify(search),
    enabled: searching,
    staleTime: 60_000,
  });
  const { q: list, items } = useCards(
    ['spotify', 'section', section],
    (o) => fetchSection(section, o),
    !searching,
  );

  /** A song or an artist plays; an album or a playlist opens to show its songs. */
  const openItem = (m: MediaItem) =>
    m.kind === 'album' || m.kind === 'playlist' ? setOpen(m) : onPlay(m.uri);

  if (open) return <Tracks item={open} onBack={() => setOpen(undefined)} onPlay={onPlay} />;

  const results = found.data
    ? [
        ['tracks', found.data.tracks],
        ['artists', found.data.artists],
        ['albums', found.data.albums],
        ['playlists', found.data.playlists],
      ].filter(([, rows]) => (rows as MediaItem[] | undefined)?.length)
    : [];

  return (
    <View style={{ gap: theme.space[3] }}>
      <Input
        label={t('music.spotify.search.label')}
        placeholder={t('music.spotify.search.placeholder')}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setSearch(text.trim())}
        returnKeyType="search"
        autoCorrect={false}
      />
      {searching ? (
        <>
          {found.isPending ? <ActivityIndicator color={p.plum} /> : null}
          {found.isError ? (
            <Text tone="safety" accessibilityRole="alert">
              {errorText(found.error)}
            </Text>
          ) : null}
          {found.data && !results.length ? (
            <Text style={{ color: p.muted }}>{t('music.spotify.noMatches', { q: search })}</Text>
          ) : null}
          {results.map(([kind, rows]) => (
            <View key={kind as string} style={{ gap: theme.space[2] }}>
              <Text variant="kicker" style={{ color: p.gold }}>
                {t(`music.spotify.results.${kind as string}`)}
              </Text>
              <Cards items={rows as MediaItem[]} onOpen={openItem} />
            </View>
          ))}
        </>
      ) : (
        <>
          <Choice<Section>
            label={t('music.spotify.libraryLabel')}
            value={section}
            onChange={setSection}
            options={SECTIONS.map((id) => ({ id, label: t(`music.spotify.section.${id}`) }))}
          />
          <Status q={list} count={items.length} emptyKey={`music.spotify.empty.${section}`} />
          <Cards items={items} onOpen={openItem} />
          {list.hasNextPage ? (
            <Button
              label={t('music.spotify.more')}
              variant="secondary"
              onPress={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              fullWidth
            />
          ) : null}
        </>
      )}
    </View>
  );
}

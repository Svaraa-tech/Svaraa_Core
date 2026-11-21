import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/features/auth/useErrorText';
import { InfoRow, Pill, useMainPalette } from '@/features/main/palette';
import { openSpotifyLogin } from '@/services/spotify/openLogin';
import {
  disconnectSpotify,
  getLoginUrl,
  getNowPlaying,
  getSpotifyStatus,
  playItem,
  sendPlayerCommand,
  type PlayerAction,
} from '@/services/spotify/spotifyApi';
import { Button, Text, useTheme } from '@/ui';
import { SpotifyBrowse } from './SpotifyBrowse';

const VOLUME_STEP = 10;
/** After Connect, check this often (and for this long) in case the phone's browser cannot say when it closed. */
const CONNECT_POLL_MS = 3000;
const CONNECT_POLL_FOR_MS = 2 * 60_000;
/** While something plays, refresh the mini player this often. */
const NOW_PLAYING_POLL_MS = 5000;

const STATUS_KEY = ['spotify', 'status'] as const;
const NOW_KEY = ['spotify', 'now-playing'] as const;

/** Music > Spotify tab: connect a Spotify account to this phone, see what plays, and use the player buttons. */
export function SpotifyView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  // After Connect, keep asking the server for a while whether Spotify is linked (see CONNECT_POLL_FOR_MS).
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), CONNECT_POLL_FOR_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getSpotifyStatus,
    refetchInterval: (q) => (waiting && !q.state.data?.connected ? CONNECT_POLL_MS : false),
    refetchOnWindowFocus: true,
  });
  const connected = status.data?.connected === true;

  const nowPlaying = useQuery({
    queryKey: NOW_KEY,
    queryFn: getNowPlaying,
    enabled: connected,
    refetchInterval: (q) => (q.state.data?.is_playing ? NOW_PLAYING_POLL_MS : false),
  });

  const connect = useMutation({
    mutationFn: async () => {
      const url = await getLoginUrl();
      setWaiting(true);
      await openSpotifyLogin(url);
    },
    // The browser has closed (or never opened): ask the server whether Spotify is now linked.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });
  const command = useMutation({
    mutationFn: ({ action, volume }: { action: PlayerAction; volume?: number }) =>
      sendPlayerCommand(action, volume),
    onSuccess: (out) => queryClient.setQueryData(NOW_KEY, out),
  });
  const playCard = useMutation({
    mutationFn: ({ uri, context }: { uri: string; context?: string }) => playItem(uri, context),
    onSuccess: (out) => queryClient.setQueryData(NOW_KEY, out),
  });
  const disconnect = useMutation({
    mutationFn: disconnectSpotify,
    onSuccess: () => {
      setWaiting(false);
      queryClient.removeQueries({ queryKey: NOW_KEY });
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  if (status.isPending) return <ActivityIndicator color={p.plum} />;

  if (status.isError)
    return (
      <View style={{ gap: theme.space[2] }}>
        <Text tone="safety" accessibilityRole="alert">
          {errorText(status.error)}
        </Text>
        <Button
          label={t('music.retry')}
          variant="secondary"
          onPress={() => void status.refetch()}
          fullWidth
        />
      </View>
    );

  if (!connected)
    return (
      <View style={{ gap: theme.space[3] }}>
        <Text style={{ color: p.muted }}>{t('music.spotify.intro')}</Text>
        {connect.isError ? (
          <Text tone="safety" accessibilityRole="alert">
            {errorText(connect.error)}
          </Text>
        ) : null}
        {waiting ? (
          <Text variant="bodySm" style={{ color: p.muted }} accessibilityLiveRegion="polite">
            {t('music.spotify.waiting')}
          </Text>
        ) : null}
        <Button
          label={t('music.spotify.connect')}
          onPress={() => connect.mutate()}
          loading={connect.isPending}
          fullWidth
        />
      </View>
    );

  const now = nowPlaying.data;
  const premium = status.data?.product === 'premium';
  const devices = status.data?.devices ?? [];
  const busy = command.isPending || playCard.isPending;
  const press = (action: PlayerAction, volume?: number) => command.mutate({ action, volume });
  const volume = now?.volume_percent;

  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <Text style={{ color: p.ink, fontWeight: '700', flexShrink: 1 }}>
          {t('music.spotify.connectedAs', { name: status.data?.display_name ?? 'Spotify' })}
        </Text>
        <Pill label={t('music.spotify.connected')} tone="plum" />
      </View>
      {!premium ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('music.spotify.needsPremium')}
        </Text>
      ) : null}

      {status.data?.needs_reconnect ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="bodySm" style={{ color: p.muted }}>
            {t('music.spotify.needsReconnect')}
          </Text>
          <Button
            label={t('music.spotify.reconnect')}
            variant="secondary"
            onPress={() => connect.mutate()}
            loading={connect.isPending}
            fullWidth
          />
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: p.card,
          borderWidth: 1,
          borderColor: p.line,
          borderRadius: 15,
          padding: 14,
          gap: theme.space[2],
        }}
      >
        <Text variant="kicker" style={{ color: p.gold }}>
          {t('music.spotify.nowPlaying')}
        </Text>
        {now?.track ? (
          <>
            <Text style={{ color: p.ink, fontWeight: '700' }}>{now.track.name}</Text>
            <Text variant="bodySm" style={{ color: p.muted }}>
              {[now.track.artists, now.track.album].filter(Boolean).join(' · ')}
            </Text>
          </>
        ) : nowPlaying.isPending ? (
          <ActivityIndicator color={p.plum} />
        ) : (
          <Text variant="bodySm" style={{ color: p.muted }}>
            {t('music.spotify.nothingPlaying')}
          </Text>
        )}
        {now?.device ? (
          <Text variant="bodySm" style={{ color: p.muted }}>
            {t('music.spotify.onDevice', { name: now.device.name })}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('music.spotify.previous')}
              variant="secondary"
              onPress={() => press('previous')}
              disabled={busy || !premium}
              fullWidth
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={now?.is_playing ? t('music.pause') : t('music.play')}
              onPress={() => press(now?.is_playing ? 'pause' : 'play')}
              disabled={!premium}
              loading={busy}
              fullWidth
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('music.spotify.next')}
              variant="secondary"
              onPress={() => press('next')}
              disabled={busy || !premium}
              fullWidth
            />
          </View>
        </View>
        {typeof volume === 'number' ? (
          <View style={{ gap: theme.space[2] }}>
            <Text variant="bodySm" style={{ color: p.muted }} accessibilityLiveRegion="polite">
              {t('music.spotify.volume', { n: volume })}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('music.spotify.quieter')}
                  variant="secondary"
                  onPress={() => press('volume', Math.max(0, volume - VOLUME_STEP))}
                  disabled={busy || !premium || volume <= 0}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('music.spotify.louder')}
                  variant="secondary"
                  onPress={() => press('volume', Math.min(100, volume + VOLUME_STEP))}
                  disabled={busy || !premium || volume >= 100}
                  fullWidth
                />
              </View>
            </View>
          </View>
        ) : null}
        {command.isError || playCard.isError || nowPlaying.isError ? (
          <Text tone="safety" accessibilityRole="alert">
            {errorText(command.error ?? playCard.error ?? nowPlaying.error)}
          </Text>
        ) : null}
      </View>

      <Text variant="bodySm" style={{ color: p.muted }}>
        {t('music.spotify.askSvaraa')}
      </Text>

      <SpotifyBrowse onPlay={(uri, context) => playCard.mutate({ uri, context })} />

      <Text variant="kicker" style={{ color: p.gold }}>
        {t('music.spotify.devices')}
      </Text>
      {devices.length ? (
        devices.map((d) => (
          <InfoRow
            key={`${d.name}-${d.type}`}
            title={d.name}
            detail={d.type}
            right={d.is_active ? <Pill label={t('music.spotify.active')} tone="plum" /> : undefined}
          />
        ))
      ) : (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('music.spotify.noDevices')}
        </Text>
      )}

      {disconnect.isError ? (
        <Text tone="safety" accessibilityRole="alert">
          {errorText(disconnect.error)}
        </Text>
      ) : null}
      <Button
        label={t('music.spotify.disconnect')}
        variant="secondary"
        onPress={() => disconnect.mutate()}
        loading={disconnect.isPending}
        fullWidth
      />
    </View>
  );
}

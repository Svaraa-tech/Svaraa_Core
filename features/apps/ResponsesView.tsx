import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTimeAgo } from '@/features/chat/ChatHistory';
import { useChat, type ChatMessage, type Conversation } from '@/features/chat/store';
import { InfoRow, Pill, useMainPalette } from '@/features/main/palette';
import { Button, Text, useTheme } from '@/ui';

const QUICK_REPLIES = ['fine', 'call', 'medicine'] as const;

/** One message of a chat, read-only. Proposed actions show their title; failed replies are left out. */
function Line({ m }: { m: ChatMessage }) {
  const { t } = useTranslation();
  const p = useMainPalette();
  if (m.role === 'assistant' && m.kind === 'error') return null;
  const mine = m.role === 'user';
  const text = m.role === 'assistant' && m.kind === 'proposal' ? `${m.title}: ${m.detail}` : m.text;
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" style={{ color: mine ? p.gold : p.plum, fontWeight: '600' }}>
        {t(mine ? 'apps.responses.you' : 'apps.responses.svaraa')}
      </Text>
      <Text style={{ color: p.ink }}>{text}</Text>
    </View>
  );
}

/** A chat from the history: tap to read it here, or continue it in Chat. */
function Past({ chat }: { chat: Conversation }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const router = useRouter();
  const ago = useTimeAgo();
  const [open, setOpen] = useState(false);
  const loading = open && chat.needsMessages;

  return (
    <View style={{ gap: theme.space[2] }}>
      <InfoRow
        title={chat.title || t('chat.untitled')}
        detail={t('chat.lastMessage', { time: ago(chat.updatedAt) })}
        right={<Pill label={open ? t('apps.responses.hide') : t('apps.responses.read')} />}
        onPress={() => {
          setOpen((o) => !o);
          if (!open) void useChat.getState().loadMessages(chat.id);
        }}
      />
      {open ? (
        <View
          style={{
            gap: theme.space[2],
            padding: 14,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: p.line,
            backgroundColor: p.card,
          }}
        >
          {loading ? <ActivityIndicator color={p.plum} /> : null}
          {chat.messages.map((m, i) => (
            <Line key={i} m={m} />
          ))}
          <Button
            label={t('apps.responses.continue')}
            variant="secondary"
            onPress={() => {
              useChat.getState().open(chat.id);
              router.navigate('/chat');
            }}
            fullWidth
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Responses: the quick replies Svaraa can send (PENDING BACKEND: sample content from the wireframes) and the chat
 * history. The history is the same as in Chat (GET /conversations, GET /conversations/{id}/messages).
 */
export function ResponsesView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const conversations = useChat((s) => s.conversations);
  const history = useChat((s) => s.history);
  const loadHistory = useChat((s) => s.loadHistory);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  const recent = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);

  return (
    <>
      <Text style={{ color: p.muted }}>{t('apps.responses.intro')}</Text>
      {QUICK_REPLIES.map((k) => (
        <InfoRow key={k} title={t(`apps.responses.${k}`)} />
      ))}

      <Text variant="kicker" style={{ color: p.gold }}>
        {t('apps.responses.history')}
      </Text>
      {history === 'loading' ? <ActivityIndicator color={p.plum} /> : null}
      {history === 'error' ? (
        <View style={{ gap: theme.space[2] }}>
          <Text tone="safety" accessibilityRole="alert">
            {t('apps.responses.historyError')}
          </Text>
          <Button label={t('music.retry')} variant="secondary" onPress={() => void loadHistory()} fullWidth />
        </View>
      ) : null}
      {history !== 'loading' && history !== 'error' && !recent.length ? (
        <Text style={{ color: p.muted }}>{t('apps.responses.noHistory')}</Text>
      ) : null}
      {recent.map((c) => (
        <Past key={c.id} chat={c} />
      ))}
    </>
  );
}

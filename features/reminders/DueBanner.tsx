import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useChat } from '@/features/chat/store';
import { useMainPalette } from '@/features/main/palette';
import { useNewChat } from '@/features/main/useNewChat';
import type { ScheduleItem } from '@/services/reminders/remindersApi';
import { Button, Text, useTheme } from '@/ui';
import { RESPONSES, useDueAlerts, type ReminderResponse } from './alertsStore';

/**
 * Reminders that are due now, over the top of any screen, until each is answered: Done, Pending (not yet),
 * Discuss (opens a new chat about it) or Dismiss.
 */
export function DueBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const newChat = useNewChat();
  const due = useDueAlerts((s) => s.due);
  const respond = useDueAlerts((s) => s.respond);
  if (!due.length) return null;

  const answer = (item: ScheduleItem, status: ReminderResponse) => {
    respond(item, status);
    if (status === 'discuss') {
      newChat();
      useChat.getState().setDraft(t('reminders.alert.discussDraft', { text: item.text }));
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 1000,
        alignItems: 'center',
        gap: 8,
      }}
    >
      {due.map((item) => (
        <View
          key={`${item.reminder_id}|${item.due_at}`}
          accessibilityRole="alert"
          style={{
            width: '100%',
            maxWidth: 560,
            gap: theme.space[2],
            padding: 14,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: p.gold,
            backgroundColor: p.card,
          }}
        >
          <Text variant="kicker" style={{ color: p.gold }}>
            {t('reminders.alert.title')}
          </Text>
          <Text style={{ color: p.ink, fontWeight: '700' }}>{item.text}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            {RESPONSES.map((status) => (
              <View key={status} style={{ flexGrow: 1, flexBasis: 120 }}>
                <Button
                  label={t(`reminders.alert.response.${status}`)}
                  variant={status === 'done' ? 'primary' : 'secondary'}
                  onPress={() => answer(item, status)}
                  fullWidth
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

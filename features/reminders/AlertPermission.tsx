import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMainPalette } from '@/features/main/palette';
import {
  getPermission,
  requestPermission,
  type PermissionStatus,
} from '@/services/notifications/notificationsApi';
import { Button, Text, useTheme } from '@/ui';

/** Web only: how to get alerts on this page. Notifications need one click to allow; the beep and banner need none. */
export function AlertPermission() {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const [status, setStatus] = useState<PermissionStatus>('granted');
  const web = Platform.OS === 'web';
  useEffect(() => {
    if (web) void getPermission().then(setStatus);
  }, [web]);
  if (!web) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text variant="bodySm" style={{ color: p.muted }}>
        {t('reminders.alert.pageOpen')}
      </Text>
      {status === 'undetermined' ? (
        <Button
          label={t('reminders.alert.allow')}
          variant="secondary"
          onPress={() => void requestPermission().then(setStatus)}
          fullWidth
        />
      ) : null}
      {status === 'denied' ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('reminders.alert.blocked')}
        </Text>
      ) : null}
    </View>
  );
}

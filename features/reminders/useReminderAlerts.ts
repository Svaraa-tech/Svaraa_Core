import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { scheduleAlerts } from './alertTimers';
import { prepareAlerts, ringAlert } from './alertOutput';
import { useDueAlerts } from './alertsStore';
import { useReminderSchedule } from './store';

/**
 * Web only, while the page is open: when a reminder in the schedule is due, beep once, show a browser notification
 * (if allowed) and put a banner on the page. A closed page cannot alert: that needs web push from the backend.
 */
export function useReminderAlerts() {
  const { t } = useTranslation();
  const items = useReminderSchedule((s) => s.items);
  const fired = useRef(new Set<string>());
  const web = Platform.OS === 'web';

  useEffect(() => (web ? prepareAlerts() : undefined), [web]);
  // The answers given earlier on this device.
  useEffect(() => {
    if (web) void useDueAlerts.getState().load();
  }, [web]);
  useEffect(() => {
    if (!web) return;
    return scheduleAlerts(
      items,
      (item) => {
        useDueAlerts.getState().add(item);
        ringAlert(t('reminders.alert.title'), item.text);
      },
      fired.current,
    );
  }, [web, items, t]);
}

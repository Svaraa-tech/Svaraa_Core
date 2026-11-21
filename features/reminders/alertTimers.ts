import type { ScheduleItem } from '@/services/reminders/remindersApi';

/** A time that is already this far past still alerts (a timer that ran a little late); older ones are dropped. */
export const MAX_LATE_MS = 60_000;

/** One alert per reminder time: the same key as the backend's advice for alarms (`reminder_id` and `due_at`). */
export const alertKey = (item: ScheduleItem) => `${item.reminder_id}|${item.due_at}`;

/**
 * Set a timer for each time in the schedule. `fired` remembers the times already alerted, so setting the timers
 * again (the schedule changed, or was loaded again) never alerts the same time twice.
 * Returns a function that cancels the timers that have not fired yet.
 */
export function scheduleAlerts(
  items: ScheduleItem[],
  fire: (item: ScheduleItem) => void,
  fired: Set<string>,
  now = Date.now(),
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const item of items) {
    const key = alertKey(item);
    const wait = Date.parse(item.due_at) - now;
    if (fired.has(key) || Number.isNaN(wait) || wait < -MAX_LATE_MS) continue;
    timers.push(
      setTimeout(
        () => {
          fired.add(key);
          fire(item);
        },
        Math.max(0, wait),
      ),
    );
  }
  return () => timers.forEach(clearTimeout);
}

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  getReminderSchedule,
  SCHEDULE_KEEP_MS,
  SCHEDULE_POLL_MS,
  type ScheduleItem,
} from '@/services/reminders/remindersApi';

type State = {
  /** The times still to come, from the last check, in order (UTC). */
  items: ScheduleItem[];
  version?: string;
  /** The list reaches this far ahead (UTC). */
  windowEnd?: string;
  /** When this phone last checked with the server (ms). */
  checkedAt?: number;
  checking: boolean;
  error: unknown;
  /** Ask the server for the schedule. `force` asks for the whole list even when nothing changed. */
  sync(householdId: string, force?: boolean): Promise<void>;
  reset(): void;
};

const EMPTY = { items: [], version: undefined, windowEnd: undefined, checkedAt: undefined, error: null };

/**
 * The wearer's reminder schedule on this phone: which reminders fire in the next 48 hours. The phone asks the server
 * at least every 5 minutes (useScheduleSync) and on "Check now". When the held list still reaches 24 hours ahead it
 * sends back its version, and the server answers "up to date" with nothing to download.
 * PENDING: the phone does not set alarms from this list yet; the pendant or a local notification will say them.
 */
export const useReminderSchedule = create<State>((set, get) => ({
  ...EMPTY,
  checking: false,
  sync: async (householdId, force = false) => {
    if (get().checking) return;
    set({ checking: true });
    const now = Date.now();
    const { version, windowEnd } = get();
    const keep = !force && version && windowEnd && Date.parse(windowEnd) - now >= SCHEDULE_KEEP_MS;
    try {
      const out = await getReminderSchedule(householdId, keep ? version : undefined);
      if (out.up_to_date) {
        // Same list: only drop the times that have passed.
        set({ items: get().items.filter((i) => Date.parse(i.due_at) > now), checkedAt: now, error: null });
      } else {
        set({
          items: out.items,
          version: out.version,
          windowEnd: out.window_end,
          checkedAt: now,
          error: null,
        });
      }
    } catch (error) {
      set({ error, checkedAt: now });
    } finally {
      set({ checking: false });
    }
  },
  reset: () => set({ ...EMPTY, checking: false }),
}));

/**
 * For the wearer's phone: check the schedule now, then every 5 minutes, and whenever the app comes back to the
 * front. Stops when `householdId` is undefined (signed out, or not a wearer).
 */
export function useScheduleSync(householdId: string | undefined) {
  useEffect(() => {
    if (!householdId) {
      useReminderSchedule.getState().reset();
      return;
    }
    const sync = () => void useReminderSchedule.getState().sync(householdId);
    sync();
    const timer = setInterval(sync, SCHEDULE_POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [householdId]);
}

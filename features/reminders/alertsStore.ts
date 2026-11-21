import { create } from 'zustand';
import type { ScheduleItem } from '@/services/reminders/remindersApi';
import { storage } from '@/services/storage';
import { alertKey } from './alertTimers';

const KEY = 'svaraa.reminder-responses';
/** Only the newest answers are kept on this device. */
const KEEP = 200;

/** How the person answered a due reminder. */
export const RESPONSES = ['done', 'pending', 'discuss', 'dismissed'] as const;
export type ReminderResponse = (typeof RESPONSES)[number];

/** An answer to one time a reminder fired. */
export type Answered = { status: ReminderResponse; at: string };

type Done = Promise<void>;

type State = {
  /** Reminders that are due and not answered yet, oldest first. Shown as a banner on the page. */
  due: ScheduleItem[];
  /** The answers, by `reminder_id|due_at`. */
  answers: Record<string, Answered>;
  add: (item: ScheduleItem) => void;
  /** Answer a due reminder: it leaves the banner and the answer is remembered. */
  respond: (item: ScheduleItem, status: ReminderResponse) => void;
  load: () => Done;
  clear: () => void;
};

/**
 * PENDING BACKEND: the answers are kept on this device only. The backend has no place for them yet; it will need
 * a row per time a reminder fired (`reminder_id`, `due_at`, status), saved when the person answers.
 */
export const useDueAlerts = create<State>((set, get) => ({
  due: [],
  answers: {},
  add: (item) => set((s) => ({ due: [...s.due, item] })),
  respond: (item, status) => {
    const answers = { ...get().answers, [alertKey(item)]: { status, at: new Date().toISOString() } };
    const newest = Object.entries(answers)
      .sort(([, a], [, b]) => b.at.localeCompare(a.at))
      .slice(0, KEEP);
    set({ due: get().due.filter((d) => d !== item), answers: Object.fromEntries(newest) });
    void storage.set(KEY, JSON.stringify(get().answers)).catch(() => undefined);
  },
  load: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) set({ answers: JSON.parse(raw) as Record<string, Answered> });
    } catch {
      /* unreadable: start with none */
    }
  },
  clear: () => set({ due: [], answers: {} }),
}));

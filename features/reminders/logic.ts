/**
 * Reminder rules with no screen code, so they can be tested on their own. The form works in the phone's local
 * date and time; the server stores the rule and sends times back in UTC.
 */
import type { Reminder, ReminderIn, ReminderPatch, ReminderRule } from '@/services/reminders/remindersApi';

/** How often, as the server names it: once, daily, weekdays (Mon to Fri), chosen days, or every few hours. */
export type Kind = ReminderRule['kind'];
export const KINDS: Kind[] = ['once', 'daily', 'weekdays', 'days', 'interval'];

export type Draft = {
  text: string;
  /** The first day, YYYY-MM-DD, local. */
  date: string;
  hour: number;
  minute: number;
  kind: Kind;
  /** For `days`: 1 = Monday ... 7 = Sunday. */
  days: number[];
  /** For `interval`: every 1 to 12 hours, from the start time until `until` o'clock. */
  every: number;
  until: number;
  /** Ask again until the wearer says done: up to 3 times, 5 minutes apart. */
  confirm: boolean;
};

export const MAX_TEXT = 200;
export const MIN_AHEAD_MIN = 10;
export const MAX_AHEAD_DAYS = 90;

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** The first time the draft fires, as a local Date. */
export const startOf = (d: Pick<Draft, 'date' | 'hour' | 'minute'>) => {
  const day = dayOf(d.date);
  day.setHours(d.hour, d.minute, 0, 0);
  return day;
};

/** A new draft: 7 PM today, or tomorrow when that is less than 10 minutes away. */
export function newDraft(now: Date): Draft {
  const draft: Draft = {
    text: '',
    date: dateKey(now),
    hour: 19,
    minute: 0,
    kind: 'daily',
    days: [],
    every: 2,
    until: 21,
    confirm: true,
  };
  return startOf(draft).getTime() - now.getTime() < MIN_AHEAD_MIN * 60_000
    ? { ...draft, date: dateKey(addDays(now, 1)) }
    : draft;
}

/** The rule as the server takes it. */
export function ruleOf(d: Draft): ReminderRule {
  if (d.kind === 'days') return { kind: 'days', days: [...d.days].sort((a, b) => a - b) };
  if (d.kind === 'interval') return { kind: 'interval', every_hours: d.every, until: `${pad(d.until)}:00` };
  return { kind: d.kind };
}

/** The local date and time the server reads in X-Timezone, e.g. 2026-11-20T19:00. */
export const startsAt = (d: Draft) => `${d.date}T${pad(d.hour)}:${pad(d.minute)}`;

export const toReminderIn = (d: Draft): ReminderIn => ({
  text: d.text.trim(),
  starts_at: startsAt(d),
  rule: ruleOf(d),
  repeat_until_confirmed: d.confirm,
});

/** The server's rule (a plain object in its answer) read back. */
export function readRule(r: Reminder): ReminderRule {
  const raw = (r.rule ?? {}) as Partial<ReminderRule>;
  const kind = KINDS.includes(raw.kind as Kind) ? (raw.kind as Kind) : 'once';
  return { kind, days: raw.days ?? null, every_hours: raw.every_hours ?? null, until: raw.until ?? null };
}

/** A saved reminder as a draft, for editing. The day is the next one it fires on. */
export function fromReminder(r: Reminder): Draft {
  const rule = readRule(r);
  const first = new Date(r.starts_at);
  const next = r.next_due_at ? new Date(r.next_due_at) : first;
  return {
    text: r.text,
    date: dateKey(next),
    hour: first.getHours(),
    minute: first.getMinutes(),
    kind: rule.kind,
    days: rule.days ?? [],
    every: rule.every_hours ?? 2,
    until: rule.until ? Number(rule.until.slice(0, 2)) : 21,
    confirm: r.repeat_until_confirmed,
  };
}

/** Only what changed, as the server's PATCH wants it. The time is sent again only when it was changed. */
export function patchOf(before: Draft, after: Draft): ReminderPatch {
  const patch: ReminderPatch = {};
  if (after.text.trim() !== before.text) patch.text = after.text.trim();
  if (after.date !== before.date || after.hour !== before.hour || after.minute !== before.minute)
    patch.starts_at = startsAt(after);
  if (JSON.stringify(ruleOf(after)) !== JSON.stringify(ruleOf(before))) patch.rule = ruleOf(after);
  if (after.confirm !== before.confirm) patch.repeat_until_confirmed = after.confirm;
  return patch;
}

export type Problem = 'noText' | 'noDays' | 'badWindow' | 'tooSoon' | 'tooFar';

/** Why the draft cannot be saved yet, checked the way the server does, or null. `timeChanged` = check the time. */
export function problemOf(d: Draft, now: Date, timeChanged = true): Problem | null {
  if (!d.text.trim()) return 'noText';
  if (d.kind === 'days' && !d.days.length) return 'noDays';
  if (d.kind === 'interval' && d.until * 60 <= d.hour * 60 + d.minute) return 'badWindow';
  if (!timeChanged) return null;
  const ahead = startOf(d).getTime() - now.getTime();
  if (ahead < MIN_AHEAD_MIN * 60_000) return 'tooSoon';
  if (ahead > MAX_AHEAD_DAYS * 86_400_000) return 'tooFar';
  return null;
}

/** Step the time by whole 5-minute steps and keep it in a day. */
export function stepTime(d: { hour: number; minute: number }, byMinutes: number) {
  const total = (((d.hour * 60 + d.minute + byMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** Move the date by days, between today and 90 days ahead. */
export function stepDate(date: string, byDays: number, now: Date): string {
  const today = dayOf(dateKey(now));
  const next = addDays(dayOf(date), byDays);
  if (next < today) return dateKey(today);
  const last = addDays(today, MAX_AHEAD_DAYS);
  return dateKey(next > last ? last : next);
}

/** True when the date is today or tomorrow. */
export const dayWord = (date: Date, now: Date): 'today' | 'tomorrow' | undefined =>
  dateKey(date) === dateKey(now)
    ? 'today'
    : dateKey(date) === dateKey(addDays(now, 1))
      ? 'tomorrow'
      : undefined;

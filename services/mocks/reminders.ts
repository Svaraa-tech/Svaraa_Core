import type { components } from '@/services/api/schema';

type S = components['schemas'];
type Reminder = S['ReminderOut'];
type Rule = S['ReminderRuleIn'];

/** The household's reminders as kept by the mock backend (see HouseholdSetup in db.ts). */
export type ReminderBox = { reminders: Reminder[]; remindersVersion: number };

export type Problem = { status: number; code: string };

export const REMINDER_LIMIT = 50;
const DAY_MS = 86_400_000;
const MIN_AHEAD_MS = 10 * 60_000;
const MAX_AHEAD_MS = 90 * DAY_MS;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (key: string) => new Date(`${key}T00:00`);
const isoDow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

/** A local "YYYY-MM-DDTHH:mm". The mock reads it in this computer's time zone (the server uses X-Timezone). */
function readStart(value: unknown): Date | Problem {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))
    return { status: 422, code: 'reminder_time_required' };
  const at = new Date(value.slice(0, 16));
  return Number.isNaN(at.getTime()) ? { status: 422, code: 'validation_error' } : at;
}

function readRule(value: unknown): Rule | Problem {
  const r = (value ?? { kind: 'once' }) as Partial<Rule>;
  const kinds = ['once', 'daily', 'weekdays', 'days', 'interval'];
  if (!r.kind || !kinds.includes(r.kind)) return { status: 422, code: 'validation_error' };
  if (r.kind === 'days' && (!r.days?.length || r.days.some((d) => d < 1 || d > 7)))
    return { status: 422, code: 'validation_error' };
  if (
    r.kind === 'interval' &&
    (!r.every_hours || r.every_hours < 1 || r.every_hours > 12 || !/^\d{2}:\d{2}$/.test(r.until ?? ''))
  )
    return { status: 422, code: 'validation_error' };
  return { kind: r.kind, days: r.days ?? null, every_hours: r.every_hours ?? null, until: r.until ?? null };
}

const isProblem = (x: unknown): x is Problem => !!x && typeof x === 'object' && 'code' in x;

/** Every time the reminder fires in (from, to]. */
export function firesBetween(r: Reminder, from: Date, to: Date): Date[] {
  const start = new Date(r.starts_at);
  const rule = r.rule as Rule;
  const last = rule.kind === 'once' ? dayKey(start) : (r.ends_on ?? dayKey(start));
  const out: Date[] = [];
  for (let day = dayStart(dayKey(start)); dayKey(day) <= last && day <= to;) {
    const ok =
      rule.kind === 'once'
        ? dayKey(day) === dayKey(start)
        : rule.kind === 'daily' || rule.kind === 'interval'
          ? true
          : rule.kind === 'weekdays'
            ? isoDow(day) <= 5
            : (rule.days ?? []).includes(isoDow(day));
    if (ok) {
      const first = new Date(day);
      first.setHours(start.getHours(), start.getMinutes(), 0, 0);
      const times = [first];
      if (rule.kind === 'interval' && rule.every_hours && rule.until) {
        const [h, m] = rule.until.split(':').map(Number);
        const end = new Date(day);
        end.setHours(h!, m!, 0, 0);
        const step = rule.every_hours * 3_600_000;
        for (let t = first.getTime() + step; t <= end.getTime(); t += step) times.push(new Date(t));
      }
      for (const t of times) if (t >= start && t > from && t <= to) out.push(t);
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return out;
}

const nextDue = (r: Reminder, now: Date) =>
  firesBetween(r, now, new Date(now.getTime() + 2 * MAX_AHEAD_MS))[0]?.toISOString() ?? null;

/** Fill in `next_due_at` and drop the reminders that have nothing left to fire (they have ended). */
export function refresh(box: ReminderBox, now = new Date()): void {
  const before = box.reminders.length;
  box.reminders = box.reminders.filter((r) => {
    const next = nextDue(r, now);
    r.next_due_at = r.status === 'paused' ? null : next;
    return next !== null;
  });
  if (box.reminders.length !== before) box.remindersVersion++;
}

/** Check and build the fields of a new or changed reminder. */
function shape(
  body: Partial<S['ReminderIn']>,
  old: Reminder | undefined,
  zone: string,
  now: Date,
): Partial<Reminder> | Problem {
  const out: Partial<Reminder> = {};
  if (body.text !== undefined && body.text !== null) {
    const text = String(body.text).trim();
    if (!text || text.length > 200) return { status: 422, code: 'validation_error' };
    out.text = text;
  }
  let start = old ? new Date(old.starts_at) : undefined;
  if (body.starts_at !== undefined && body.starts_at !== null) {
    const at = readStart(body.starts_at);
    if (isProblem(at)) return at;
    if (at.getTime() - now.getTime() < MIN_AHEAD_MS) return { status: 422, code: 'reminder_too_soon' };
    if (at.getTime() - now.getTime() > MAX_AHEAD_MS) return { status: 422, code: 'reminder_too_far_ahead' };
    start = at;
    out.starts_at = at.toISOString();
    out.timezone = zone;
  }
  if (!start) return { status: 422, code: 'reminder_time_required' };
  let rule = old?.rule as Rule | undefined;
  if (body.rule !== undefined && body.rule !== null) {
    const r = readRule(body.rule);
    if (isProblem(r)) return r;
    rule = r;
    out.rule = r;
  }
  rule ??= { kind: 'once' };
  out.rule ??= rule;
  const longest = dayKey(new Date(start.getTime() + MAX_AHEAD_MS));
  if (rule.kind === 'once') out.ends_on = null;
  else if (body.ends_on) {
    if (body.ends_on > longest) return { status: 422, code: 'reminder_runs_too_long' };
    out.ends_on = body.ends_on;
  } else if (body.ends_on === null || !old?.ends_on || old.ends_on > longest) out.ends_on = longest;
  if (body.repeat_until_confirmed !== undefined && body.repeat_until_confirmed !== null)
    out.repeat_until_confirmed = body.repeat_until_confirmed;
  return out;
}

export function createReminder(
  box: ReminderBox,
  body: unknown,
  ids: { reminderId: string; householdId: string; userId: string },
  zone: string,
  now = new Date(),
): Reminder | Problem {
  refresh(box, now);
  if (box.reminders.length >= REMINDER_LIMIT) return { status: 409, code: 'reminder_limit_reached' };
  const b = (body ?? {}) as Partial<S['ReminderIn']>;
  if (!b.text) return { status: 422, code: 'validation_error' };
  if (!b.starts_at) return { status: 422, code: 'reminder_time_required' };
  const fields = shape(b, undefined, zone, now);
  if (isProblem(fields)) return fields;
  const reminder: Reminder = {
    id: ids.reminderId,
    circle_id: ids.householdId,
    text: '',
    rule: { kind: 'once' },
    timezone: zone,
    starts_at: now.toISOString(),
    ends_on: null,
    next_due_at: null,
    repeat_until_confirmed: true,
    status: 'active',
    created_by: ids.userId,
    created_via: 'app',
    created_at: now.toISOString(),
    ...fields,
  };
  box.reminders.push(reminder);
  box.remindersVersion++;
  refresh(box, now);
  return reminder;
}

export function updateReminder(
  box: ReminderBox,
  id: string,
  body: unknown,
  zone: string,
  now = new Date(),
): Reminder | Problem {
  refresh(box, now);
  const r = box.reminders.find((x) => x.id === id);
  if (!r) return { status: 404, code: 'not_found' };
  const fields = shape((body ?? {}) as Partial<S['ReminderIn']>, r, zone, now);
  if (isProblem(fields)) return fields;
  Object.assign(r, fields);
  box.remindersVersion++;
  refresh(box, now);
  return r;
}

/** Pause, resume, renew or delete. */
export function actOn(
  box: ReminderBox,
  id: string,
  action: 'pause' | 'resume' | 'renew' | 'delete',
  now = new Date(),
): Reminder | Problem | 'deleted' {
  refresh(box, now);
  const r = box.reminders.find((x) => x.id === id);
  if (!r) return { status: 404, code: 'not_found' };
  if (action === 'delete') box.reminders = box.reminders.filter((x) => x.id !== id);
  else if (action === 'pause') r.status = 'paused';
  else if (action === 'resume') r.status = 'active';
  else {
    if ((r.rule as Rule).kind === 'once') return { status: 409, code: 'reminder_not_recurring' };
    const longest = dayKey(new Date(now.getTime() + MAX_AHEAD_MS));
    if (!r.ends_on || r.ends_on < longest) r.ends_on = longest;
  }
  box.remindersVersion++;
  refresh(box, now);
  return action === 'delete' ? 'deleted' : r;
}

export function listOf(box: ReminderBox, now = new Date()): S['ReminderListOut'] {
  refresh(box, now);
  const key = (r: Reminder) => r.next_due_at ?? '9999';
  const items = [...box.reminders].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return { items, limit: REMINDER_LIMIT, count: box.reminders.length };
}

export function scheduleOf(
  box: ReminderBox,
  query: URLSearchParams | undefined,
  now = new Date(),
): S['ScheduleOut'] {
  refresh(box, now);
  const hours = Math.min(72, Math.max(1, Number(query?.get('hours')) || 48));
  const end = new Date(now.getTime() + hours * 3_600_000);
  const version = `v${box.remindersVersion}`;
  const base = { version, server_time: now.toISOString(), window_end: end.toISOString() };
  if (query?.get('version') === version) return { ...base, up_to_date: true, items: [] };
  const items = box.reminders
    .filter((r) => r.status === 'active')
    .flatMap((r) =>
      firesBetween(r, now, end).map((at) => ({
        reminder_id: r.id,
        text: r.text,
        due_at: at.toISOString(),
        repeat_until_confirmed: r.repeat_until_confirmed,
      })),
    )
    .sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
  return { ...base, up_to_date: false, items };
}

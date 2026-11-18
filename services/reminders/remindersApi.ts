import { api, call, type components } from '@/services/api';
import { realHouseholdId } from '@/services/household/householdApi';

type S = components['schemas'];

/**
 * Reminders on the real backend (flags.remindersApi). The server keeps each reminder's rule and tells the wearer's
 * phone when they fire (the schedule); the phone itself speaks them and repeats them until the wearer says done.
 * There is no history: a time that has passed is gone. Times in answers are UTC.
 */
export type Reminder = S['ReminderOut'];
export type ReminderIn = S['ReminderIn'];
export type ReminderPatch = S['ReminderPatchIn'];
export type ReminderRule = S['ReminderRuleIn'];
export type ReminderList = S['ReminderListOut'];
export type ReminderSchedule = S['ScheduleOut'];
export type ScheduleItem = S['ScheduleItemOut'];

/** The wearer's phone asks for the schedule at least this often. */
export const SCHEDULE_POLL_MS = 5 * 60_000;
/** How far ahead the schedule reaches (the server allows 1 to 72 hours). */
export const SCHEDULE_HOURS = 48;
/** Send back the version held only while the held list still reaches at least this far ahead. */
export const SCHEDULE_KEEP_MS = 24 * 3_600_000;

/**
 * Old names some browsers and phones still report, and the current name the server knows. Chrome on Windows says
 * "Asia/Calcutta" for India, which the server refuses with `invalid_timezone`.
 */
const OLD_ZONE_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Ujung_Pandang': 'Asia/Makassar',
  'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
};

/** This phone's time zone by its current name, e.g. Asia/Kolkata. The server reads the typed date and time in it. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    return OLD_ZONE_NAMES[zone] ?? zone;
  } catch {
    return 'Asia/Kolkata';
  }
}

const circle = async (householdId: string) => ({ circle_id: await realHouseholdId(householdId) });
const one = async (householdId: string, reminderId: string) => ({
  ...(await circle(householdId)),
  reminder_id: reminderId,
});
const zone = () => ({ 'x-timezone': deviceTimeZone() });

/** Active and paused reminders, soonest first, with how many of the household's slots (50) are in use. */
export const listReminders = async (householdId: string): Promise<ReminderList> =>
  call(api.GET('/api/v1/circles/{circle_id}/reminders', { params: { path: await circle(householdId) } }));

/**
 * New reminder (wearer or admin; the household must be active). `starts_at` is the local date and time, e.g.
 * 2026-11-20T19:00: at least 10 minutes and at most 90 days ahead.
 */
export const createReminder = async (householdId: string, body: ReminderIn): Promise<Reminder> =>
  call(
    api.POST('/api/v1/circles/{circle_id}/reminders', {
      params: { path: await circle(householdId), header: zone() },
      body,
    }),
  );

/** Change a reminder. Only the fields sent change. */
export const updateReminder = async (
  householdId: string,
  reminderId: string,
  body: ReminderPatch,
): Promise<Reminder> =>
  call(
    api.PATCH('/api/v1/circles/{circle_id}/reminders/{reminder_id}', {
      params: { path: await one(householdId, reminderId), header: zone() },
      body,
    }),
  );

export const deleteReminder = async (householdId: string, reminderId: string): Promise<void> =>
  call(
    api.DELETE('/api/v1/circles/{circle_id}/reminders/{reminder_id}', {
      params: { path: await one(householdId, reminderId) },
    }),
  );

/** A paused reminder does not fire but still counts towards the 50. */
export const pauseReminder = async (householdId: string, reminderId: string): Promise<Reminder> =>
  call(
    api.POST('/api/v1/circles/{circle_id}/reminders/{reminder_id}/pause', {
      params: { path: await one(householdId, reminderId) },
    }),
  );

export const resumeReminder = async (householdId: string, reminderId: string): Promise<Reminder> =>
  call(
    api.POST('/api/v1/circles/{circle_id}/reminders/{reminder_id}/resume', {
      params: { path: await one(householdId, reminderId) },
    }),
  );

/** A repeating reminder runs for at most 90 days; this moves its end to 90 days from today. */
export const renewReminder = async (householdId: string, reminderId: string): Promise<Reminder> =>
  call(
    api.POST('/api/v1/circles/{circle_id}/reminders/{reminder_id}/renew', {
      params: { path: await one(householdId, reminderId) },
    }),
  );

/**
 * For the wearer's phone: when the active reminders fire from now to `SCHEDULE_HOURS` ahead. Send back the
 * `version` held to get `up_to_date: true` and no items when nothing changed.
 */
export const getReminderSchedule = async (householdId: string, version?: string): Promise<ReminderSchedule> =>
  call(
    api.GET('/api/v1/circles/{circle_id}/reminders/schedule', {
      params: { path: await circle(householdId), query: { hours: SCHEDULE_HOURS, version } },
    }),
  );

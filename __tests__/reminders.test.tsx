import { act, fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { useHousehold } from '@/features/household/store';
import {
  fromReminder,
  newDraft,
  patchOf,
  problemOf,
  stepDate,
  stepTime,
  toReminderIn,
  type Draft,
} from '@/features/reminders/logic';
import { RemindersView } from '@/features/reminders/RemindersView';
import { useReminderSchedule } from '@/features/reminders/store';
import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { useSession } from '@/services/auth/session';
import { saveContacts } from '@/services/household/wearerApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import {
  createReminder,
  deviceTimeZone,
  getReminderSchedule,
  listReminders,
} from '@/services/reminders/remindersApi';
import {
  createWearerHousehold,
  INDIA,
  requests,
  useMockBackend,
  verifyTestPendant,
} from '@/test-utils/backend';
import { renderApp } from '@/test-utils/render';

const now = new Date(2026, 10, 12, 10, 0); // a Thursday, 10 AM
const draft = (patch: Partial<Draft> = {}): Draft => ({
  ...newDraft(now),
  text: 'Take ABC medicines',
  ...patch,
});
const pad = (n: number) => String(n).padStart(2, '0');
/** A local "YYYY-MM-DDTHH:mm" some minutes from the real now. */
const inMinutes = (m: number) => {
  const d = new Date(Date.now() + m * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

describe('reminder rules', () => {
  it('turns the form into what the server takes', () => {
    expect(toReminderIn(draft())).toEqual({
      text: 'Take ABC medicines',
      starts_at: '2026-11-12T19:00',
      rule: { kind: 'daily' },
      repeat_until_confirmed: true,
    });
    expect(toReminderIn(draft({ kind: 'days', days: [5, 1, 3] })).rule).toEqual({
      kind: 'days',
      days: [1, 3, 5],
    });
    expect(toReminderIn(draft({ kind: 'interval', hour: 9, every: 2, until: 19 })).rule).toEqual({
      kind: 'interval',
      every_hours: 2,
      until: '19:00',
    });
  });
  it('checks the time the way the server does', () => {
    expect(problemOf(draft({ text: ' ' }), now)).toBe('noText');
    expect(problemOf(draft({ kind: 'days' }), now)).toBe('noDays');
    expect(problemOf(draft({ hour: 10, minute: 5 }), now)).toBe('tooSoon');
    expect(problemOf(draft({ date: '2027-03-01' }), now)).toBe('tooFar');
    expect(problemOf(draft({ kind: 'interval', hour: 20, until: 19 }), now)).toBe('badWindow');
    expect(problemOf(draft(), now)).toBeNull();
    // Editing a reminder without touching its time does not check the time again.
    expect(problemOf(draft({ hour: 10, minute: 5 }), now, false)).toBeNull();
  });
  it('starts tomorrow when 7 PM is less than 10 minutes away', () => {
    expect(newDraft(new Date(2026, 10, 12, 18, 55)).date).toBe('2026-11-13');
  });
  it('steps the date between today and 90 days ahead, and the time round the clock', () => {
    expect(stepDate('2026-11-12', -1, now)).toBe('2026-11-12');
    expect(stepDate('2026-11-12', 1, now)).toBe('2026-11-13');
    expect(stepDate('2026-11-12', 200, now)).toBe('2027-02-10');
    expect(stepTime({ hour: 23, minute: 55 }, 5)).toEqual({ hour: 0, minute: 0 });
  });
  it('sends only what changed when editing', () => {
    const before = draft();
    expect(patchOf(before, { ...before, text: 'Walk' })).toEqual({ text: 'Walk' });
    expect(patchOf(before, { ...before, hour: 20 })).toEqual({ starts_at: '2026-11-12T20:00' });
    expect(patchOf(before, { ...before, kind: 'weekdays' })).toEqual({ rule: { kind: 'weekdays' } });
  });
});

describe('time zone', () => {
  const zoneIs = (timeZone: string) =>
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone } as Intl.ResolvedDateTimeFormatOptions);
  afterEach(() => jest.restoreAllMocks());
  it('sends the current name for an old one the server refuses', () => {
    zoneIs('Asia/Calcutta');
    expect(deviceTimeZone()).toBe('Asia/Kolkata');
    zoneIs('Europe/London');
    expect(deviceTimeZone()).toBe('Europe/London');
  });
});

describe('reminders on the mock backend', () => {
  let householdId = '';
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    await useMockBackend();
    await verifyOtpAndSignIn(INDIA, DEMO_CODE);
    const userId = useSession.getState().userId as string;
    await useHousehold.getState().load(userId);
    householdId = await createWearerHousehold();
    await verifyTestPendant(householdId);
    await saveContacts(householdId, [{ name: 'Meera', country_code: '+91', mobile_number: '9812344410' }]);
    await useHousehold.getState().chooseRole('wearer', householdId);
    useReminderSchedule.getState().reset();
  });

  it('creates, lists and schedules a reminder, and refuses one too soon', async () => {
    const r = await createReminder(householdId, {
      text: 'Drink water',
      starts_at: inMinutes(30),
      rule: { kind: 'daily' },
      repeat_until_confirmed: true,
    });
    expect(fromReminder(r).text).toBe('Drink water');
    const list = await listReminders(householdId);
    expect(list).toMatchObject({ count: 1, limit: 50 });
    const schedule = await getReminderSchedule(householdId);
    expect(schedule.items.map((i) => i.text)).toEqual(['Drink water', 'Drink water']); // today and tomorrow
    // Nothing changed: sending the version back gets "up to date".
    expect(await getReminderSchedule(householdId, schedule.version)).toMatchObject({
      up_to_date: true,
      items: [],
    });
    await expect(
      createReminder(householdId, {
        text: 'Soon',
        starts_at: inMinutes(5),
        rule: { kind: 'once' },
        repeat_until_confirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'reminder_too_soon' });
  });

  it('adds a reminder from the screen and the wearer can check the schedule now', async () => {
    await renderApp(<RemindersView />);
    expect(await screen.findByText('0 of 50 reminders')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'New reminder' })[0]!);
    await fireEvent.changeText(screen.getByLabelText('What should Svaraa say?'), 'Water the plants');
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Save reminder' })));
    expect((await screen.findAllByText('Water the plants')).length).toBeGreaterThan(0);
    expect(await screen.findByText('1 of 50 reminders')).toBeTruthy();
    const before = requests.filter((r) => r.path.endsWith('/reminders/schedule')).length;
    await act(
      async () => await fireEvent.press(screen.getByRole('button', { name: 'Check for reminders now' })),
    );
    expect(requests.filter((r) => r.path.endsWith('/reminders/schedule')).length).toBeGreaterThan(before);
    expect(useReminderSchedule.getState().checkedAt).toBeDefined();
  });

  it('pauses and deletes a reminder from its page', async () => {
    await createReminder(householdId, {
      text: 'Morning walk',
      starts_at: inMinutes(60),
      rule: { kind: 'daily' },
      repeat_until_confirmed: true,
    });
    await renderApp(<RemindersView />);
    await fireEvent.press(await screen.findByText('Morning walk'));
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Pause reminder' })));
    expect(await screen.findByRole('button', { name: 'Resume reminder' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Tap again to delete' })));
    expect((await listReminders(householdId)).count).toBe(0);
  });
});

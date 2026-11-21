import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { alertKey, scheduleAlerts } from '@/features/reminders/alertTimers';
import { useDueAlerts } from '@/features/reminders/alertsStore';
import { DueBanner } from '@/features/reminders/DueBanner';
import { ringAlert } from '@/features/reminders/alertOutput';
import { useReminderSchedule } from '@/features/reminders/store';
import { useReminderAlerts } from '@/features/reminders/useReminderAlerts';
import type { ScheduleItem } from '@/services/reminders/remindersApi';
import { renderApp } from '@/test-utils/render';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
  usePathname: () => '/apps',
}));
jest.mock('@/features/reminders/alertOutput', () => ({
  prepareAlerts: jest.fn(() => () => undefined),
  ringAlert: jest.fn(),
}));

const NOW = Date.parse('2026-11-21T10:00:00Z');
const item = (id: string, inSeconds: number, text = 'Take BP tablet'): ScheduleItem => ({
  reminder_id: id,
  text,
  due_at: new Date(NOW + inSeconds * 1000).toISOString(),
  repeat_until_confirmed: false,
});

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  await i18n.changeLanguage('en');
  useDueAlerts.getState().clear();
  useReminderSchedule.getState().reset();
});
afterEach(() => jest.useRealTimers());

describe('alert timers', () => {
  it('fires each time when it is due, once, and not before', () => {
    const fire = jest.fn();
    const fired = new Set<string>();
    scheduleAlerts([item('a', 60), item('b', 120)], fire, fired, NOW);
    jest.advanceTimersByTime(59_000);
    expect(fire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(fire).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(120_000);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('does not alert a time again when the timers are set again', () => {
    const fire = jest.fn();
    const fired = new Set<string>();
    const items = [item('a', 10)];
    scheduleAlerts(items, fire, fired, NOW);
    jest.advanceTimersByTime(11_000);
    scheduleAlerts(items, fire, fired, NOW + 11_000);
    jest.advanceTimersByTime(60_000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fired.has(alertKey(items[0]!))).toBe(true);
  });

  it('can be cancelled, and skips a time that passed more than a minute ago', () => {
    const fire = jest.fn();
    const cancel = scheduleAlerts([item('a', 30), item('old', -120)], fire, new Set(), NOW);
    cancel();
    jest.advanceTimersByTime(60_000);
    expect(fire).not.toHaveBeenCalled();
    scheduleAlerts([item('late', -10)], fire, new Set(), NOW);
    jest.advanceTimersByTime(0);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});

function Alerts() {
  useReminderAlerts();
  return null;
}

describe('alerts on the web', () => {
  const before = Platform.OS;
  afterEach(() => {
    Platform.OS = before;
  });

  it('rings and shows the banner when a reminder in the schedule is due', async () => {
    Platform.OS = 'web';
    await renderApp(
      <>
        <Alerts />
        <DueBanner />
      </>,
    );
    await act(async () => {
      useReminderSchedule.setState({ items: [item('a', 30, 'Walk in the garden')] });
    });
    expect(screen.queryByText('Walk in the garden')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(ringAlert).toHaveBeenCalledWith('Reminder', 'Walk in the garden');
    expect(await screen.findByText('Walk in the garden')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(useDueAlerts.getState().due).toEqual([]);
    await waitFor(() => expect(screen.queryByText('Walk in the garden')).toBeNull());
  });

  it('does nothing on a phone (the phone will use the system alarms)', async () => {
    Platform.OS = 'ios';
    await renderApp(<Alerts />);
    await act(async () => {
      useReminderSchedule.setState({ items: [item('a', 30)] });
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(ringAlert).not.toHaveBeenCalled();
    expect(useDueAlerts.getState().due).toEqual([]);
  });
});

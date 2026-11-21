import { act, fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { useChat } from '@/features/chat/store';
import { alertKey } from '@/features/reminders/alertTimers';
import { useDueAlerts } from '@/features/reminders/alertsStore';
import { DueBanner } from '@/features/reminders/DueBanner';
import type { ScheduleItem } from '@/services/reminders/remindersApi';
import { renderApp } from '@/test-utils/render';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => '/apps',
}));

const due: ScheduleItem = {
  reminder_id: 'a',
  text: 'Take BP tablet',
  due_at: '2026-11-21T10:00:00.000Z',
  repeat_until_confirmed: false,
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockNavigate.mockClear();
  useChat.getState().reset();
  useDueAlerts.getState().clear();
});

describe('answering a due reminder', () => {
  it.each([
    ['Done', 'done'],
    ['Pending', 'pending'],
    ['Dismiss', 'dismissed'],
  ])('%s is remembered for that reminder time and closes the banner', async (label, status) => {
    await renderApp(<DueBanner />);
    await act(async () => {
      useDueAlerts.getState().add(due);
    });
    await fireEvent.press(await screen.findByRole('button', { name: label }));
    expect(useDueAlerts.getState().due).toEqual([]);
    expect(useDueAlerts.getState().answers[alertKey(due)]?.status).toBe(status);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Discuss opens a new chat about the reminder', async () => {
    await renderApp(<DueBanner />);
    await act(async () => {
      useDueAlerts.getState().add(due);
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Discuss' }));
    expect(useDueAlerts.getState().answers[alertKey(due)]?.status).toBe('discuss');
    expect(useChat.getState().currentId).toBeUndefined();
    expect(useChat.getState().draft).toContain('Take BP tablet');
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });
});

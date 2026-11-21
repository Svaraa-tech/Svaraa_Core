import { fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { useChat } from '@/features/chat/store';
import { ResponsesView } from '@/features/apps/ResponsesView';
import { renderApp } from '@/test-utils/render';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => '/apps',
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockNavigate.mockClear();
  useChat.getState().reset();
});

describe('Responses app', () => {
  it('lists the chat history under the quick replies and reads a chat here', async () => {
    await renderApp(<ResponsesView />);
    expect(screen.getByText('Chat history')).toBeTruthy();
    expect(screen.getByText('Quick replies Svaraa can send for you.')).toBeTruthy();
    expect(screen.getByText('Will it rain tomorrow?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Will it rain tomorrow?'));
    expect(await screen.findByText(/Light showers are likely after 3 PM/)).toBeTruthy();
    expect(screen.getByText('Svaraa')).toBeTruthy();
  });

  it('continues a chat in Chat', async () => {
    await renderApp(<ResponsesView />);
    await fireEvent.press(screen.getByText('Will it rain tomorrow?'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue in Chat' }));
    expect(useChat.getState().currentId).toBe('c2');
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('says so when there are no chats yet', async () => {
    useChat.setState({ conversations: [] });
    await renderApp(<ResponsesView />);
    expect(screen.getByText(/No chats yet/)).toBeTruthy();
  });
});

import { flags } from '@/config/flags';
import { useChat } from '@/features/chat/store';
import { askSvaraa } from '@/services/chat/chatApi';
import * as conversations from '@/services/chat/conversationsApi';

jest.mock('@/services/chat/chatApi', () => ({ askSvaraa: jest.fn() }));
jest.mock('@/services/chat/conversationsApi');

const api = jest.mocked(conversations);
const ask = jest.mocked(askSvaraa);
const SERVER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.replaceProperty(flags, 'ai', 'real');
  useChat.getState().reset();
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

describe('chat history from the server', () => {
  it("starts empty (no sample chats) and loads the person's conversations once", async () => {
    expect(useChat.getState().conversations).toEqual([]);
    api.listConversations.mockResolvedValue({
      items: [
        {
          id: SERVER_ID,
          title: 'Rain',
          channel: 'chat',
          message_count: 2,
          created_at: '2026-11-20T10:00:00Z',
          last_message_at: '2026-11-20T10:05:00Z',
        },
      ],
      next_cursor: null,
    });
    await useChat.getState().loadHistory();
    await useChat.getState().loadHistory();
    expect(api.listConversations).toHaveBeenCalledTimes(1);
    expect(useChat.getState().conversations.map((c) => c.title)).toEqual(['Rain']);
  });

  it("loads a chat's messages when it is opened", async () => {
    api.listConversations.mockResolvedValue({
      items: [
        {
          id: SERVER_ID,
          title: 'Rain',
          channel: 'chat',
          message_count: 2,
          created_at: '2026-11-20T10:00:00Z',
          last_message_at: '2026-11-20T10:05:00Z',
        },
      ],
      next_cursor: null,
    });
    api.getMessages.mockResolvedValue({
      items: [
        { id: 'm1', role: 'user', content: 'Will it rain?', events: [], created_at: '2026-11-20T10:00:00Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Yes, later.',
          events: [],
          created_at: '2026-11-20T10:00:05Z',
        },
      ],
      older_cursor: null,
    });
    await useChat.getState().loadHistory();
    useChat.getState().open(SERVER_ID);
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getMessages).toHaveBeenCalledWith(SERVER_ID);
    expect(useChat.getState().conversations[0]?.messages).toEqual([
      { role: 'user', text: 'Will it rain?' },
      { role: 'assistant', kind: 'text', text: 'Yes, later.' },
    ]);
  });

  it("gives a new chat the server's id after its first reply and continues it with that id", async () => {
    ask.mockResolvedValue({ conversationId: SERVER_ID, text: 'Hello' });
    await useChat.getState().send('Hi', { failed: 'failed' });
    expect(ask).toHaveBeenLastCalledWith('Hi', undefined);
    expect(useChat.getState().currentId).toBe(SERVER_ID);
    expect(useChat.getState().conversations.map((c) => c.id)).toEqual([SERVER_ID]);
    await useChat.getState().send('And tomorrow?', { failed: 'failed' });
    expect(ask).toHaveBeenLastCalledWith('And tomorrow?', SERVER_ID);
  });

  it('renames, deletes one chat and deletes everything on the server too', async () => {
    ask.mockResolvedValue({ conversationId: SERVER_ID, text: 'Hello' });
    await useChat.getState().send('Hi', { failed: 'failed' });
    api.renameConversation.mockResolvedValue({} as never);
    await useChat.getState().rename(SERVER_ID, ' Greetings ');
    expect(api.renameConversation).toHaveBeenCalledWith(SERVER_ID, 'Greetings');
    expect(useChat.getState().conversations[0]?.title).toBe('Greetings');
    await useChat.getState().remove(SERVER_ID);
    expect(api.deleteConversation).toHaveBeenCalledWith(SERVER_ID);
    expect(useChat.getState().conversations).toEqual([]);
    api.deleteAllConversations.mockResolvedValue(0);
    await useChat.getState().clearAll();
    expect(api.deleteAllConversations).toHaveBeenCalled();
  });
});

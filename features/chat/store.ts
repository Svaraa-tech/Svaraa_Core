import { create } from 'zustand';
import { flags } from '@/config/flags';
import { useSession } from '@/services/auth/session';
import { askSvaraa } from '@/services/chat/chatApi';
import {
  deleteAllConversations,
  deleteConversation,
  getMessages,
  listConversations,
  renameConversation,
  type ServerMessage,
} from '@/services/chat/conversationsApi';

export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; kind: 'text'; text: string }
  /** The reply did not arrive (no connection, server error). `text` is our own message, never server text. */
  | { role: 'assistant'; kind: 'error'; text: string }
  | {
      role: 'assistant';
      kind: 'proposal';
      title: string;
      detail: string;
      status: 'waiting' | 'done' | 'cancelled';
    };

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  /** The server's conversation id, so Svaraa remembers the earlier messages of this chat. */
  sessionId?: string;
  /** From the server's history and its messages are not fetched yet (they load when the chat is opened). */
  needsMessages?: boolean;
};

/** With the real server, the history is the person's own (GET /conversations) instead of the sample chats below. */
const serverHistory = () => flags.ai === 'real';

const toMessage = (m: ServerMessage): ChatMessage =>
  m.role === 'user'
    ? { role: 'user', text: m.content }
    : { role: 'assistant', kind: 'text', text: m.content };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => Date.now() - ms;

/**
 * Replies come from POST /chat/ (services/chat). With the real server (flags.ai) the chat list and each chat's
 * messages come from the person's history (GET /conversations, services/chat/conversationsApi). PENDING BACKEND with
 * the mock switch, and for proposed actions on both: they live in memory. The sample chats come from the wireframes
 * (D · Main app) and are used only with the mock switch.
 */
const SEED: Conversation[] = [
  {
    id: 'c1',
    title: 'Evening medicine reminder',
    updatedAt: ago(2 * HOUR),
    messages: [
      { role: 'user', text: 'Remind me to take my BP tablet every evening' },
      {
        role: 'assistant',
        kind: 'proposal',
        title: 'Set a daily reminder',
        detail: 'Take BP tablet · 8:00 PM, every day',
        status: 'done',
      },
    ],
  },
  {
    id: 'c2',
    title: 'Will it rain tomorrow?',
    updatedAt: ago(5 * HOUR),
    messages: [
      { role: 'user', text: 'Will it rain tomorrow?' },
      {
        role: 'assistant',
        kind: 'text',
        text: 'Light showers are likely after 3 PM. Take an umbrella if you go to the temple in the evening.',
      },
    ],
  },
  {
    id: 'c3',
    title: 'Call Ravi about Sunday',
    updatedAt: ago(DAY + 2 * HOUR),
    messages: [
      { role: 'user', text: 'Call Ravi on Sunday about lunch' },
      {
        role: 'assistant',
        kind: 'proposal',
        title: 'Remind you to call Ravi',
        detail: 'Sunday · 6:00 PM',
        status: 'done',
      },
    ],
  },
  {
    id: 'c4',
    title: 'Morning bhajan playlist',
    updatedAt: ago(3 * DAY),
    messages: [
      { role: 'user', text: 'Play some bhajans in the morning' },
      {
        role: 'assistant',
        kind: 'text',
        text: 'I’ve made “Morning bhajans” with 24 songs. Say “Svaraa, play my morning bhajans” any time.',
      },
    ],
  },
];

type Done = Promise<void>;

type ChatState = {
  conversations: Conversation[];
  /** The open chat. undefined = a new, empty chat. */
  currentId: string | undefined;
  draft: string;
  /** The chat whose reply is on its way ("Svaraa is typing"). */
  waitingId: string | undefined;
  /** The server's history: not asked for yet, loading, loaded, or failed. */
  history: 'idle' | 'loading' | 'ready' | 'error';
  /** Ask the server for the person's chats (once; call again after an error). */
  loadHistory: () => Done;
  rename: (id: string, title: string) => Done;
  remove: (id: string) => Done;
  /** Delete the whole history on the server (and here). */
  clearAll: () => Done;
  /** The voice view (call button) is open. */
  voiceOpen: boolean;
  setVoiceOpen: (open: boolean) => void;
  /** Put what was said in a voice session into the open chat, or a new chat, so it stays in the history. */
  addTranscript: (turns: { role: 'user' | 'assistant'; text: string }[]) => void;
  setDraft: (d: string) => void;
  newChat: () => void;
  open: (id: string) => void;
  /** Sends the message to Svaraa (POST /chat/) and adds the reply when it arrives. `failed` is already translated. */
  send(text: string, copy: { failed: string }): Promise<void>;
  decide: (chatId: string, index: number, status: 'done' | 'cancelled') => void;
  reset: () => void;
};

const fresh = (): Pick<
  ChatState,
  'conversations' | 'currentId' | 'draft' | 'voiceOpen' | 'waitingId' | 'history'
> => ({
  conversations: serverHistory() ? [] : SEED.map((c) => ({ ...c, messages: [...c.messages] })),
  history: 'idle',
  currentId: undefined,
  draft: '',
  voiceOpen: false,
  waitingId: undefined,
});

export const useChat = create<ChatState>((set, get) => ({
  ...fresh(),
  setDraft: (draft) => set({ draft }),
  setVoiceOpen: (voiceOpen) => set({ voiceOpen }),
  addTranscript: (turns) => {
    if (!turns.length) return;
    const added: ChatMessage[] = turns.map((t) =>
      t.role === 'user' ? { role: 'user', text: t.text } : { role: 'assistant', kind: 'text', text: t.text },
    );
    const { conversations, currentId } = get();
    if (conversations.some((c) => c.id === currentId)) {
      set({
        conversations: conversations.map((c) =>
          c.id === currentId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, ...added] } : c,
        ),
      });
      return;
    }
    const id = `c${Date.now()}`;
    const first = turns.find((t) => t.role === 'user')?.text ?? turns[0]?.text ?? '';
    set({
      currentId: id,
      conversations: [
        { id, title: first.slice(0, 48), updatedAt: Date.now(), messages: added },
        ...conversations,
      ],
    });
  },
  newChat: () => set({ currentId: undefined, draft: '' }),
  open: (id) => {
    set({ currentId: id });
    const chat = get().conversations.find((c) => c.id === id);
    if (!chat?.needsMessages || !chat.sessionId) return;
    void getMessages(chat.sessionId)
      .then((page) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, needsMessages: false, messages: page.items.map(toMessage) } : c,
          ),
        })),
      )
      .catch(() => undefined);
  },
  loadHistory: async () => {
    if (!serverHistory() || get().history === 'loading' || get().history === 'ready') return;
    set({ history: 'loading' });
    try {
      const page = await listConversations();
      set((s) => {
        const known = new Set(s.conversations.map((c) => c.sessionId));
        const fromServer: Conversation[] = page.items
          .filter((c) => !known.has(c.id))
          .map((c) => ({
            id: c.id,
            sessionId: c.id,
            title: c.title ?? '',
            updatedAt: Date.parse(c.last_message_at),
            messages: [],
            needsMessages: true,
          }));
        return { history: 'ready', conversations: [...s.conversations, ...fromServer] };
      });
    } catch {
      set({ history: 'error' });
    }
  },
  rename: async (id, title) => {
    const chat = get().conversations.find((c) => c.id === id);
    const name = title.trim();
    if (!chat || !name) return;
    if (serverHistory() && chat.sessionId) await renameConversation(chat.sessionId, name);
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: name } : c)) }));
  },
  remove: async (id) => {
    const chat = get().conversations.find((c) => c.id === id);
    if (!chat) return;
    if (serverHistory() && chat.sessionId) await deleteConversation(chat.sessionId);
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      currentId: s.currentId === id ? undefined : s.currentId,
    }));
  },
  clearAll: async () => {
    if (serverHistory()) await deleteAllConversations();
    set({ conversations: [], currentId: undefined });
  },
  send: async (text, copy) => {
    const body = text.trim();
    if (!body || get().waitingId) return;
    const { conversations, currentId } = get();
    const added: ChatMessage[] = [{ role: 'user', text: body }];

    const existing = conversations.find((c) => c.id === currentId);
    const id = existing?.id ?? `c${Date.now()}`;
    set({
      draft: '',
      currentId: id,
      waitingId: id,
      conversations: existing
        ? conversations.map((c) =>
            c.id === id ? { ...c, updatedAt: Date.now(), messages: [...c.messages, ...added] } : c,
          )
        : [{ id, title: body.slice(0, 48), updatedAt: Date.now(), messages: added }, ...conversations],
    });

    let reply: ChatMessage;
    let sessionId = existing?.sessionId;
    try {
      const out = await askSvaraa(body, sessionId);
      sessionId = out.conversationId;
      reply = { role: 'assistant', kind: 'text', text: out.text };
    } catch {
      reply = { role: 'assistant', kind: 'error', text: copy.failed };
    }
    set((s) => {
      // With the real server a new chat gets the server's id after its first reply, so the history and this list agree.
      const newId = serverHistory() && sessionId ? sessionId : id;
      return {
        waitingId: undefined,
        currentId: s.currentId === id ? newId : s.currentId,
        conversations: s.conversations.map((c) =>
          c.id === id
            ? { ...c, id: newId, sessionId, updatedAt: Date.now(), messages: [...c.messages, reply] }
            : c,
        ),
      };
    });
  },
  decide: (chatId, index, status) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== chatId
          ? c
          : {
              ...c,
              messages: c.messages.map((m, i) =>
                i === index && m.role === 'assistant' && m.kind === 'proposal' ? { ...m, status } : m,
              ),
            },
      ),
    })),
  reset: () => set(fresh()),
}));

// A different person signing in must not see the last person's chats.
useSession.subscribe((s, prev) => {
  if (s.status === 'signedOut' && prev.status !== 'signedOut') useChat.getState().reset();
});

/** How many proposed actions are waiting for a decision ("Working on N things"). */
export const usePendingCount = () =>
  useChat((s) =>
    s.conversations.reduce(
      (n, c) =>
        n +
        c.messages.filter((m) => m.role === 'assistant' && m.kind === 'proposal' && m.status === 'waiting')
          .length,
      0,
    ),
  );

export type TimeAgo = { unit: 'justNow' | 'minutes' | 'hours' | 'days'; count: number };
export function timeAgo(at: number, now = Date.now()): TimeAgo {
  const d = Math.max(0, now - at);
  if (d < MIN) return { unit: 'justNow', count: 0 };
  if (d < HOUR) return { unit: 'minutes', count: Math.floor(d / MIN) };
  if (d < DAY) return { unit: 'hours', count: Math.floor(d / HOUR) };
  return { unit: 'days', count: Math.floor(d / DAY) };
}

export type Group = 'today' | 'yesterday' | 'week' | 'older';
export function groupOf(at: number, now = Date.now()): Group {
  const d = now - at;
  if (d < DAY) return 'today';
  if (d < 2 * DAY) return 'yesterday';
  if (d < 8 * DAY) return 'week';
  return 'older';
}

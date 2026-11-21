import { api, call } from '@/services/api';
import { deviceTimeZone } from '@/services/reminders/remindersApi';

export type ChatReply = { conversationId: string; text: string };

/**
 * Ask Svaraa: POST /chat/ (one reply per message; it can use tools such as weather, time and news).
 * /chat/stream is not used: it does not run tools, and phones cannot read a streamed fetch body.
 * Needs sign-in: the server saves the chat in the person's history. Leave `conversationId` out for a new
 * conversation; pass the one from the last reply to continue it.
 * Svaraa can set reminders from chat: `x-timezone` is this phone's zone, so "7 PM" is read as the person's 7 PM.
 */
export async function askSvaraa(message: string, conversationId?: string): Promise<ChatReply> {
  const out = await call(
    api.POST('/api/v1/chat/', {
      params: { header: { 'x-timezone': deviceTimeZone() } },
      body: { message, ...(conversationId ? { conversation_id: conversationId } : {}) },
    }),
  );
  return { conversationId: out.conversation_id, text: out.response };
}

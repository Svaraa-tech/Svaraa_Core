import { api, call, type components } from '@/services/api';

type S = components['schemas'];

/** The signed-in person's chat history (typed chat and voice), on the real backend (flags.ai). */
export type ServerConversation = S['ConversationOut'];
export type ServerMessage = S['MessageOut'];
export type ConversationPage = S['ConversationListOut'];
export type MessagePage = S['MessageListOut'];

/** Conversations, most recent first. Pass the last page's `next_cursor` for the next page. */
export const listConversations = (cursor?: string, limit = 50): Promise<ConversationPage> =>
  call(api.GET('/api/v1/conversations', { params: { query: { limit, cursor } } }));

/**
 * Messages of one conversation, each page oldest first. Without `before`: the newest messages. To scroll up, pass the
 * last page's `older_cursor` as `before`.
 */
export const getMessages = (conversationId: string, before?: string, limit = 50): Promise<MessagePage> =>
  call(
    api.GET('/api/v1/conversations/{conversation_id}/messages', {
      params: { path: { conversation_id: conversationId }, query: { limit, before } },
    }),
  );

export const renameConversation = (conversationId: string, title: string): Promise<ServerConversation> =>
  call(
    api.PATCH('/api/v1/conversations/{conversation_id}', {
      params: { path: { conversation_id: conversationId } },
      body: { title },
    }),
  );

export async function deleteConversation(conversationId: string): Promise<void> {
  await call(
    api.DELETE('/api/v1/conversations/{conversation_id}', {
      params: { path: { conversation_id: conversationId } },
    }),
  );
}

/** Delete the person's whole chat history. Returns how many conversations were deleted. */
export const deleteAllConversations = async (): Promise<number> =>
  (await call(api.DELETE('/api/v1/conversations'))).deleted;

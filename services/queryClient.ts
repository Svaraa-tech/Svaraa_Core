import { QueryClient } from '@tanstack/react-query';

/** One shared client, so code outside a screen (chat and voice events) can refresh server state too. */
export const queryClient = new QueryClient();

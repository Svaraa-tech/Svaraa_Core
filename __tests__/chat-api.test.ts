import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { askSvaraa } from '@/services/chat/chatApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import { INDIA, useMockBackend } from '@/test-utils/backend';

let mockZone = 'Asia/Kolkata';
jest.mock('@/services/reminders/remindersApi', () => ({ deviceTimeZone: () => mockZone }));

const seen: { path: string; zone: string | null; auth: string | null }[] = [];

beforeEach(async () => {
  mockZone = 'Asia/Kolkata';
  seen.length = 0;
  await useMockBackend((inner) => async (input, init) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    seen.push({
      path: new URL(req.url).pathname,
      zone: req.headers.get('x-timezone'),
      auth: req.headers.get('authorization'),
    });
    return inner(input, init);
  });
});

describe('Chat', () => {
  it('needs sign-in, like the server', async () => {
    await expect(askSvaraa('Hello')).rejects.toMatchObject({ code: 'missing_token' });
  });

  it("sends the bearer token and the phone's time zone, and continues a conversation by its id", async () => {
    await verifyOtpAndSignIn(INDIA, DEMO_CODE);
    mockZone = 'Asia/Kathmandu';
    const first = await askSvaraa('Remind me to walk at 7 PM');
    const chatCall = seen.filter((r) => r.path === '/api/v1/chat/').at(-1);
    expect(chatCall?.zone).toBe('Asia/Kathmandu');
    expect(chatCall?.auth).toMatch(/^Bearer /);
    expect(first.conversationId).toBeTruthy();
    expect((await askSvaraa('And at 8?', first.conversationId)).conversationId).toBe(first.conversationId);
  });

  it('refuses a time zone the server does not know', async () => {
    await verifyOtpAndSignIn(INDIA, DEMO_CODE);
    mockZone = 'Mars/Olympus';
    await expect(askSvaraa('Hello')).rejects.toMatchObject({ code: 'invalid_timezone' });
  });
});

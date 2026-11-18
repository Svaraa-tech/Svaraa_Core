import { flags } from '@/config/flags';
import { useHousehold } from '@/features/household/store';
import * as householdApi from '@/services/household/householdApi';
import { DRAFT_HOUSEHOLD_ID, type HomeHousehold } from '@/services/household/householdApi';
import { storage } from '@/services/storage';

const USER = 'user-1';
const STALE = 'a2832152-0000-4000-8000-000000000001'; // made by the mock backend, unknown to the real server
const REAL = '5a09754d-4d4b-4689-9fd9-cc99bbed1e72';

const circle = (id: string, my_role: string, state = 'active', isProtected = false) =>
  ({ id, my_role, state, protected: isProtected }) as unknown as HomeHousehold;

/** What the phone saved earlier, then sign-in (load) with GET /me/home answering `circles`. */
async function loadWith(saved: object, circles: HomeHousehold[] | Error) {
  await storage.set(`svaraa.household.setup.${USER}`, JSON.stringify(saved));
  jest
    .spyOn(householdApi, 'getHome')
    .mockImplementation(() =>
      circles instanceof Error ? Promise.reject(circles) : Promise.resolve({ circles }),
    );
  await useHousehold.getState().load(USER);
  return useHousehold.getState();
}

const wearerSetup = { role: 'wearer', householdId: STALE, setupStep: 6, hasActiveDevice: true };

describe('household on this phone vs the server', () => {
  const before = flags.household;
  beforeEach(() => {
    flags.household = 'real';
  });
  afterEach(() => {
    flags.household = before;
    jest.restoreAllMocks();
    useHousehold.getState().unload();
  });

  it('drops a saved household the server does not know, so setup starts again at B1', async () => {
    const s = await loadWith(wearerSetup, []);
    expect(s).toMatchObject({
      role: undefined,
      householdId: undefined,
      setupStep: 0,
      hasActiveDevice: false,
    });
    // Saved too, so the next start does not bring the old id back.
    expect(
      JSON.parse((await storage.get(`svaraa.household.setup.${USER}`)) ?? '{}').householdId,
    ).toBeUndefined();
  });

  it('switches to the household the server has for this wearer', async () => {
    const s = await loadWith(wearerSetup, [circle(REAL, 'wearer', 'active', true)]);
    expect(s).toMatchObject({ role: 'wearer', householdId: REAL, hasActiveDevice: true });
  });

  it("keeps a caregiver's household (it is not one they wear)", async () => {
    const s = await loadWith(
      { role: 'caregiver', householdId: REAL, setupStep: 2, notificationsDone: true, hasActiveDevice: false },
      [circle(REAL, 'viewer')],
    );
    expect(s).toMatchObject({ role: 'caregiver', householdId: REAL, setupStep: 2 });
  });

  it('keeps the placeholder before C1, and everything when the server cannot answer', async () => {
    expect(
      await loadWith({ role: 'wearer', householdId: DRAFT_HOUSEHOLD_ID, setupStep: 2 }, []),
    ).toMatchObject({
      householdId: DRAFT_HOUSEHOLD_ID,
      setupStep: 2,
    });
    expect(await loadWith(wearerSetup, new Error('offline'))).toMatchObject({
      householdId: STALE,
      setupStep: 6,
    });
  });

  it('keeps it with the mock backend, which forgets everything when the app restarts', async () => {
    flags.household = 'mock';
    expect(await loadWith(wearerSetup, [])).toMatchObject({ householdId: STALE, setupStep: 6 });
  });
});

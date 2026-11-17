import { Platform } from 'react-native';
import { api, call } from '@/services/api';
import { env } from '@/config/env';
import { flags } from '@/config/flags';
import { getDeviceToken, getPermission, onDeviceTokenChange } from './permissions';

export { getPermission, openSettings, requestPermission, type PermissionStatus } from './permissions';

/**
 * Get this phone's push token and save it for the signed-in person (POST /me/installations). Call again whenever
 * the token changes; a token that belonged to another account is taken over.
 * The server takes phones only (android, ios): in a web browser there is nothing to save, so this does nothing.
 * A phone that cannot give a real token (Expo Go on Android since SDK 53, no project id) still saves its
 * installation with no token (the server allows that), so setup is not blocked. keepPushTokenSaved saves it again
 * on every app start, so a real token (development build or APK) fills it in. With the 'mock' switch, a placeholder
 * token is used.
 */
export async function savePushToken(): Promise<void> {
  const device = await getDeviceToken().catch(() => undefined);
  const platform = device?.platform ?? Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return;
  const token = device?.token ?? (flags.notifications === 'mock' ? `mock-push-token-${platform}` : null);
  await call(
    api.POST('/api/v1/me/installations', {
      body: { platform, push_token: token, app_version: env.appVersion },
    }),
  );
}

/**
 * Save this phone's push token again, quietly, if notifications are allowed. Fixes a save that failed during setup
 * (no internet, server error) and keeps the server's copy current. Never throws.
 */
export async function refreshPushToken(): Promise<void> {
  try {
    if ((await getPermission()) !== 'granted') return;
    await savePushToken();
  } catch (e) {
    if (__DEV__) console.warn('[notifications] could not save this phone for notifications', e);
  }
}

/**
 * For a signed-in person: save the push token now (each app start) and again whenever the phone renews it, so SOS
 * and family alerts keep reaching this phone. Returns a function that stops watching (on sign-out).
 */
export function keepPushTokenSaved(): () => void {
  void refreshPushToken();
  return onDeviceTokenChange(() => void refreshPushToken());
}

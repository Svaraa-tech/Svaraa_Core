import { Platform } from 'react-native';
import { env } from '@/config/env';
import { ApiError } from '@/services/api';
import { GoogleCancelled, type GoogleResult } from './googleTypes';

/**
 * Google sign-in on Android and iOS, with @react-native-google-signin/google-signin. Google's own account chooser
 * opens over the app and gives an ID token for `POST /auth/google`. The browser version is google.web.ts.
 *
 * Needs (all OAuth clients in the same Google Cloud project):
 * - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: the token is issued for this client, on phones too; the backend checks it
 *   (GOOGLE_CLIENT_IDS).
 * - Android: an "Android" OAuth client with package ai.svaraa and the SHA-1 of the key that signs the build. Google
 *   matches it by itself; the app does not read its ID.
 * - iOS: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (bundle ai.svaraa). app.config.ts turns it into the app's URL scheme.
 * - A development build or the APK. Expo Go does not contain this library: there it says "not available here".
 */
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let cached: GoogleModule | null | undefined;
/** Loaded on first use, so that Expo Go (which lacks the native code) still opens every other screen. */
function loadGoogle(): GoogleModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch (error) {
    if (__DEV__)
      console.warn('Google sign-in is not in this app build (Expo Go?). Use a development build.', error);
    cached = null;
  }
  return cached;
}

let configured = false;

export async function getRealGoogleCredential(): Promise<GoogleResult> {
  const google = loadGoogle();
  if (!google) throw new ApiError('google_sign_in_unavailable');
  if (!env.googleWebClientId || (Platform.OS === 'ios' && !env.googleIosClientId)) {
    if (__DEV__)
      console.warn('Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID on iOS).');
    throw new ApiError('google_sign_in_unavailable');
  }
  const { GoogleSignin, isErrorWithCode, statusCodes } = google;
  if (!configured) {
    GoogleSignin.configure({
      webClientId: env.googleWebClientId,
      iosClientId: env.googleIosClientId || undefined,
    });
    configured = true;
  }
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Always show the account chooser, so a shared phone can pick another account.
    if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut().catch(() => null);
    const result = await GoogleSignin.signIn();
    if (result.type === 'cancelled') throw new GoogleCancelled();
    const idToken = result.data.idToken;
    if (!idToken) throw new ApiError('invalid_google_token');
    return { idToken, name: result.data.user.name ?? undefined };
  } catch (error) {
    if (error instanceof GoogleCancelled || error instanceof ApiError) throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)
        throw new GoogleCancelled();
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        throw new ApiError('google_sign_in_unavailable');
      // DEVELOPER_ERROR (Android) = this build's package name or SHA-1 is not in an Android OAuth client.
      if (__DEV__) console.warn(`Google sign-in failed: ${error.code}`, error);
    }
    throw new ApiError('google_sign_in_failed');
  }
}

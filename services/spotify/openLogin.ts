import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Open Spotify's own sign-in page inside the app (Chrome Custom Tabs on Android, Safari view on iOS). Resolves when
 * the person closes it, so the caller can ask the server whether the link worked. Falls back to the phone's browser,
 * which cannot tell us when it closes: the caller also checks again when the app comes back.
 */
export async function openSpotifyLogin(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { showTitle: true });
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}

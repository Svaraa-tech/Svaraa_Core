import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Open a news story on the publisher's site inside the app (Chrome Custom Tabs on Android, Safari view on iOS,
 * a new tab on the web), so closing it brings the reader back to the News list. Falls back to the phone's browser.
 */
export async function openArticle(
  url: string,
  colors?: { toolbar: string; controls: string },
): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors?.toolbar,
      controlsColor: colors?.controls,
      enableBarCollapsing: true,
      showTitle: true,
    });
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}

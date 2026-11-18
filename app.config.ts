import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Builds on app.json. Adds Google sign-in's iOS setup when EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set: iOS returns from
 * Google's sign-in through a URL scheme made from that client ID (com.googleusercontent.apps.<id>).
 * Android needs no setup here: Google matches the package name ai.svaraa and the build's SHA-1 itself.
 * EAS builds do not see .env (it is not uploaded): set the EXPO_PUBLIC_GOOGLE_* values in eas.json or on expo.dev.
 */
const GOOGLE_PLUGIN = '@react-native-google-signin/google-signin';
const IOS_SUFFIX = '.apps.googleusercontent.com';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
  const plugins = (config.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) !== GOOGLE_PLUGIN);
  if (iosClientId.endsWith(IOS_SUFFIX)) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.slice(0, -IOS_SUFFIX.length)}`;
    plugins.push([GOOGLE_PLUGIN, { iosUrlScheme }]);
  }
  return { ...config, plugins } as ExpoConfig;
};

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { NotoSans_400Regular, NotoSans_500Medium, NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
} from '@expo-google-fonts/noto-sans-devanagari';
import {
  NotoSansTamil_400Regular,
  NotoSansTamil_500Medium,
  NotoSansTamil_600SemiBold,
} from '@expo-google-fonts/noto-sans-tamil';
import type { TypeStyle } from './tokens';

/** Fonts to load once at app start (see app/_layout.tsx). */
export const fontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansTamil_400Regular,
  NotoSansTamil_500Medium,
  NotoSansTamil_600SemiBold,
};

const WEIGHT_SUFFIX = { '400': '400Regular', '500': '500Medium', '600': '600SemiBold' } as const;

/**
 * Scripts that need a dedicated Noto family (Latin faces lack glyphs).
 * Chinese, Japanese and Korean are not bundled (about 63 MB for three weights each). They use Inter, and Android draws
 * their characters with the phone's own CJK font. Add the Noto CJK families back here when those languages ship.
 */
const SCRIPT_FACE: Record<string, string> = {
  hi: 'NotoSansDevanagari',
  ta: 'NotoSansTamil',
};

/**
 * Non-Latin UI languages use their Noto family for every text style.
 * English uses Newsreader for display text and Inter for the rest.
 */
export function fontFamily(
  language: string,
  style: Pick<TypeStyle, 'face' | 'weight'>,
  italic = false,
): string {
  const script = SCRIPT_FACE[language];
  if (script) return `${script}_${WEIGHT_SUFFIX[style.weight]}`;
  if (style.face === 'display') return italic ? 'Newsreader_400Regular_Italic' : 'Newsreader_400Regular';
  return `Inter_${WEIGHT_SUFFIX[style.weight]}`;
}

/** Extra line-height for scripts with tall marks / dense CJK. */
export function scriptLineFactor(language: string): number {
  if (language === 'hi' || language === 'ta') return 1.12;
  if (language === 'zh' || language === 'ja' || language === 'ko') return 1.08;
  return 1;
}

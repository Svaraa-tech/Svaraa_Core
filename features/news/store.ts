import { create } from 'zustand';
import { storage } from '@/services/storage';
import {
  NEWS_CATEGORIES,
  NEWS_LANGUAGES,
  type NewsCategory,
  type NewsLanguage,
} from '@/services/news/newsApi';

const KEY = 'svaraa.news.filters';

/** 'all' = every category. */
export type CategoryChoice = NewsCategory | 'all';
/** 'app' = headlines in the app's language; 'all' = both languages. */
export type LanguageChoice = NewsLanguage | 'app' | 'all';

type State = {
  category: CategoryChoice;
  language: LanguageChoice;
  load(): Promise<void>;
  setCategory(category: CategoryChoice): void;
  setLanguage(language: LanguageChoice): void;
};

const isCategory = (v: unknown): v is CategoryChoice =>
  v === 'all' || NEWS_CATEGORIES.includes(v as NewsCategory);
const isLanguage = (v: unknown): v is LanguageChoice =>
  v === 'app' || v === 'all' || NEWS_LANGUAGES.includes(v as NewsLanguage);

/** The News app's category and language, remembered on this device. */
export const useNewsFilters = create<State>((set, get) => {
  const save = () =>
    void storage
      .set(KEY, JSON.stringify({ category: get().category, language: get().language }))
      .catch(() => undefined);
  return {
    category: 'all',
    language: 'app',
    load: async () => {
      try {
        const saved = JSON.parse((await storage.get(KEY)) ?? '{}') as Record<string, unknown>;
        if (isCategory(saved.category)) set({ category: saved.category });
        if (isLanguage(saved.language)) set({ language: saved.language });
      } catch {
        /* keep the defaults */
      }
    },
    setCategory: (category) => {
      set({ category });
      save();
    },
    setLanguage: (language) => {
      set({ language });
      save();
    },
  };
});

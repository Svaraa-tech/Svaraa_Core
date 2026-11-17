import { api, call, type components } from '@/services/api';

type S = components['schemas'];

/** One headline, as the server sends it. `summary` is a short snippet from the feed, not the article. */
export type NewsArticle = S['ArticleOut'];
export type NewsPage = S['NewsPageOut'];
export type NewsFilters = S['NewsFiltersOut'];
export type NewsCategory = S['CategoryOut']['id'];
export type NewsLanguage = S['LanguageOut']['id'];

/** The server's categories, in its order. Used for the chips until GET /news/filters answers. */
export const NEWS_CATEGORIES: NewsCategory[] = [
  'general',
  'india',
  'world',
  'business',
  'technology',
  'sports',
  'entertainment',
  'science',
  'health',
];
export const NEWS_LANGUAGES: NewsLanguage[] = ['en', 'hi'];

/** Headlines per page (the server allows 1 to 50). */
export const NEWS_PAGE_SIZE = 20;

export type NewsQuery = {
  /** Leave out for every category. */
  category?: NewsCategory;
  /** Leave out for both languages. */
  language?: NewsLanguage;
  /** Keywords; every word must be in the headline or snippet. At most 100 characters. */
  q?: string;
  /** `next_cursor` of the previous page. */
  cursor?: string;
};

/**
 * Latest headlines, newest first (GET /news). The server reads public news feeds about every 15 minutes, so the
 * list can be empty for a minute or two after a fresh server start. Needs sign-in.
 */
export const getNews = ({ category, language, q, cursor }: NewsQuery): Promise<NewsPage> =>
  call(
    api.GET('/api/v1/news', {
      params: {
        query: {
          category,
          language,
          q: q?.trim().slice(0, 100) || undefined,
          cursor,
          limit: NEWS_PAGE_SIZE,
        },
      },
    }),
  );

/** The categories and languages for the filter chips, each category named in both languages (GET /news/filters). */
export const getNewsFilters = (): Promise<NewsFilters> => call(api.GET('/api/v1/news/filters'));

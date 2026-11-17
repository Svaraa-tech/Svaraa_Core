import type { components } from '@/services/api/schema';

type S = components['schemas'];
type Category = S['CategoryOut']['id'];
type Language = S['LanguageOut']['id'];

/** The same categories and labels as GET /news/filters on the server. */
export const newsFilters: S['NewsFiltersOut'] = {
  categories: [
    { id: 'general', label: { en: 'Top stories', hi: 'मुख्य ख़बरें' } },
    { id: 'india', label: { en: 'India', hi: 'भारत' } },
    { id: 'world', label: { en: 'World', hi: 'दुनिया' } },
    { id: 'business', label: { en: 'Business', hi: 'व्यापार' } },
    { id: 'technology', label: { en: 'Technology', hi: 'तकनीक' } },
    { id: 'sports', label: { en: 'Sports', hi: 'खेल' } },
    { id: 'entertainment', label: { en: 'Entertainment', hi: 'मनोरंजन' } },
    { id: 'science', label: { en: 'Science', hi: 'विज्ञान' } },
    { id: 'health', label: { en: 'Health', hi: 'सेहत' } },
  ],
  languages: [
    { id: 'en', label: 'English' },
    { id: 'hi', label: 'हिन्दी' },
  ],
};

/**
 * Made-up placeholder headlines (not real news) so the News app has something to show on the mock backend.
 * [category, language, title, summary, source]
 */
const SAMPLES: [Category, Language, string, string, string][] = [
  [
    'general',
    'en',
    'Sample: City opens new parks for morning walkers',
    'A placeholder snippet from the feed.',
    'Sample Daily',
  ],
  [
    'india',
    'en',
    'Sample: Government extends free health check-ups for senior citizens',
    'A placeholder snippet from the feed.',
    'Sample India',
  ],
  [
    'india',
    'hi',
    'नमूना: वरिष्ठ नागरिकों के लिए मुफ़्त स्वास्थ्य जाँच बढ़ाई गई',
    'फ़ीड से एक नमूना अंश।',
    'नमूना समाचार',
  ],
  [
    'world',
    'en',
    'Sample: Global health body publishes new guidance on healthy ageing',
    'A placeholder snippet from the feed.',
    'Sample Wire',
  ],
  ['world', 'hi', 'नमूना: स्वस्थ बुढ़ापे पर नई वैश्विक सलाह जारी', 'फ़ीड से एक नमूना अंश।', 'नमूना वायर'],
  [
    'business',
    'en',
    'Sample: Markets steady as central banks hold interest rates',
    'A placeholder snippet from the feed.',
    'Sample Business',
  ],
  ['business', 'hi', 'नमूना: ब्याज दरें स्थिर, बाज़ार में हलचल कम', 'फ़ीड से एक नमूना अंश।', 'नमूना व्यापार'],
  [
    'technology',
    'en',
    'Sample: New phone settings make text easier to read',
    'A placeholder snippet from the feed.',
    'Sample Tech',
  ],
  [
    'sports',
    'en',
    'Sample: Cricket team names its squad for the coming series',
    'A placeholder snippet from the feed.',
    'Sample Sports',
  ],
  ['sports', 'hi', 'नमूना: आगामी सीरीज़ के लिए क्रिकेट टीम घोषित', 'फ़ीड से एक नमूना अंश।', 'नमूना खेल'],
  [
    'entertainment',
    'en',
    'Sample: Classic film festival returns this weekend',
    'A placeholder snippet from the feed.',
    'Sample Screen',
  ],
  [
    'science',
    'en',
    'Sample: Space agencies confirm the date of the next crewed mission',
    'A placeholder snippet from the feed.',
    'Sample Science',
  ],
  [
    'health',
    'en',
    'Sample: New study links daily walking to a longer, healthier life',
    'A placeholder snippet from the feed.',
    'Sample Health',
  ],
  ['health', 'hi', 'नमूना: रोज़ टहलने से लंबी और सेहतमंद उम्र', 'फ़ीड से एक नमूना अंश।', 'नमूना सेहत'],
];

const CATEGORIES = new Set<string>(newsFilters.categories.map((c) => c.id));
const LANGUAGES = new Set<string>(newsFilters.languages.map((l) => l.id));

/**
 * GET /news on the mock backend: filtered by category, language and keywords (every word must appear), newest
 * first, paged with a cursor. Undefined for a filter value the server would refuse (422).
 */
export function sampleNewsPage(query: URLSearchParams): S['NewsPageOut'] | undefined {
  const category = query.get('category');
  const language = query.get('language');
  if (category && !CATEGORIES.has(category)) return undefined;
  if (language && !LANGUAGES.has(language)) return undefined;
  const words = (query.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(50, Math.max(1, Number(query.get('limit')) || 20));
  const start = Math.max(0, Number(query.get('cursor')) || 0);
  const now = Date.now();
  const all: S['ArticleOut'][] = SAMPLES.map(([cat, lang, title, summary, source], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    title,
    summary,
    source,
    url: 'https://example.com/news',
    image_url: null,
    category: cat,
    language: lang,
    published_at: new Date(now - (i + 1) * 37 * 60_000).toISOString(),
  })).filter(
    (a) =>
      (!category || a.category === category) &&
      (!language || a.language === language) &&
      words.every((w) => `${a.title} ${a.summary ?? ''}`.toLowerCase().includes(w)),
  );
  const items = all.slice(start, start + limit);
  return { items, next_cursor: start + limit < all.length ? String(start + limit) : null };
}

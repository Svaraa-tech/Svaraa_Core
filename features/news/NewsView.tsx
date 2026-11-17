import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/features/auth/useErrorText';
import { useMainPalette } from '@/features/main/palette';
import { useNewsFilters, type CategoryChoice, type LanguageChoice } from '@/features/news/store';
import {
  getNews,
  getNewsFilters,
  NEWS_CATEGORIES,
  NEWS_LANGUAGES,
  type NewsArticle,
  type NewsLanguage,
} from '@/services/news/newsApi';
import { openArticle } from '@/services/news/openArticle';
import { Button, Choice, Input, Text, useTheme } from '@/ui';

/** The server refreshes its headlines about every 15 minutes. */
const STALE_MS = 5 * 60_000;
/** Wait this long after the last key press before searching. */
const SEARCH_DELAY_MS = 500;

/** News app: the latest headlines, by category and language, with a keyword search. */
export function NewsView() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const errorText = useErrorText();
  const category = useNewsFilters((s) => s.category);
  const languageChoice = useNewsFilters((s) => s.language);
  const setCategory = useNewsFilters((s) => s.setCategory);
  const setLanguage = useNewsFilters((s) => s.setLanguage);
  useEffect(() => void useNewsFilters.getState().load(), []);

  const appLanguage: NewsLanguage = i18n.language === 'hi' ? 'hi' : 'en';
  const language = languageChoice === 'app' ? appLanguage : languageChoice;

  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Chip names come from the server, in the app's language; our own names are used until it answers.
  const filters = useQuery({ queryKey: ['news-filters'], queryFn: getNewsFilters, staleTime: Infinity });
  const categoryName = (id: CategoryChoice) => {
    if (id === 'all') return t('news.all');
    const label = filters.data?.categories.find((c) => c.id === id)?.label;
    return label?.[appLanguage] ?? label?.en ?? t(`news.category.${id}`);
  };
  const languageName = (id: NewsLanguage) =>
    filters.data?.languages.find((l) => l.id === id)?.label ?? t(`news.language.${id}`);
  const categories: CategoryChoice[] = [
    'all',
    ...(filters.data?.categories.map((c) => c.id) ?? NEWS_CATEGORIES),
  ];
  const languages: NewsLanguage[] = filters.data?.languages.map((l) => l.id) ?? NEWS_LANGUAGES;

  const news = useInfiniteQuery({
    queryKey: ['news', category, language, search],
    queryFn: ({ pageParam }) =>
      getNews({
        category: category === 'all' ? undefined : category,
        language: language === 'all' ? undefined : language,
        q: search || undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: STALE_MS,
  });
  const items = news.data?.pages.flatMap((page) => page.items) ?? [];

  const ago = (iso: string) => {
    // Measured from when the list arrived, so the screen needs no clock of its own.
    const mins = Math.max(1, Math.round((news.dataUpdatedAt - Date.parse(iso)) / 60_000));
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / (24 * 60)), 'day');
  };

  const open = (item: NewsArticle) => void openArticle(item.url, { toolbar: p.card, controls: p.plum });

  return (
    <View style={{ gap: theme.space[3] }}>
      <Input
        label={t('news.search.label')}
        placeholder={t('news.search.placeholder')}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setSearch(text.trim())}
        returnKeyType="search"
        maxLength={100}
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Choice<CategoryChoice>
          label={t('news.categoryLabel')}
          value={category}
          onChange={setCategory}
          options={categories.map((id) => ({ id, label: categoryName(id) }))}
        />
      </ScrollView>

      <Choice<LanguageChoice>
        label={t('news.languageLabel')}
        value={language}
        onChange={(id) => setLanguage(id === appLanguage ? 'app' : id)}
        options={[
          ...languages.map((id) => ({ id: id as LanguageChoice, label: languageName(id) })),
          { id: 'all' as LanguageChoice, label: t('news.bothLanguages') },
        ]}
      />

      {news.isPending ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], padding: theme.space[3] }}
        >
          <ActivityIndicator color={p.plum} />
          <Text style={{ color: p.muted }} accessibilityLiveRegion="polite">
            {t('news.loading')}
          </Text>
        </View>
      ) : null}

      {news.isError ? (
        <View style={{ gap: theme.space[2] }}>
          <Text tone="safety" accessibilityRole="alert">
            {errorText(news.error)}
          </Text>
          <Button label={t('news.retry')} variant="secondary" onPress={() => void news.refetch()} fullWidth />
        </View>
      ) : null}

      {news.isSuccess && items.length === 0 ? (
        <Text style={{ color: p.muted }} accessibilityLiveRegion="polite">
          {search ? t('news.noMatches', { q: search }) : t('news.empty')}
        </Text>
      ) : null}

      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="link"
          accessibilityLabel={`${item.title}. ${item.source}`}
          onPress={() => open(item)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: theme.space[3],
            backgroundColor: p.card,
            borderWidth: 1,
            borderColor: p.line,
            borderRadius: 15,
            padding: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              accessibilityIgnoresInvertColors
              style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: p.plumSoft }}
            />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: p.ink, fontWeight: '600' }} numberOfLines={3}>
              {item.title}
            </Text>
            {item.summary ? (
              <Text variant="bodySm" style={{ color: p.muted }} numberOfLines={3}>
                {item.summary}
              </Text>
            ) : null}
            <Text variant="caption" style={{ color: p.gold, fontWeight: '600' }}>
              {`${item.source} · ${categoryName(item.category)} · ${ago(item.published_at)}`}
            </Text>
          </View>
        </Pressable>
      ))}

      {news.hasNextPage ? (
        <Button
          label={t('news.more')}
          variant="secondary"
          onPress={() => void news.fetchNextPage()}
          loading={news.isFetchingNextPage}
          fullWidth
        />
      ) : null}

      {news.isSuccess ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="caption" style={{ color: p.muted }}>
            {t('news.footer', {
              time: new Date(news.dataUpdatedAt).toLocaleTimeString(i18n.language, {
                hour: 'numeric',
                minute: '2-digit',
              }),
            })}
          </Text>
          <Button
            label={t('news.refresh')}
            variant="tertiary"
            onPress={() => void news.refetch()}
            loading={news.isRefetching && !news.isFetchingNextPage}
          />
        </View>
      ) : null}
    </View>
  );
}

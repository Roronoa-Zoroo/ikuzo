import { matchTitles } from "@ikuzo/anime/title-match";
import type { AnimeSummary, Source } from "@ikuzo/anime/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { RowList } from "@/components/row-list";
import { FilterChips, hasFilters, NO_FILTERS, passesFilters } from "@/components/search-filters";
import type { SearchFilters } from "@/components/search-filters";
import { EmptyState } from "@/components/states";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { openAnime } from "@/lib/nav";
import { useGenres, useSearch } from "@/lib/queries";
import { animeKey, useBookmarks, useEntries, useEntryLookup, useSettings, WATCH_STATUS_LABELS } from "@/lib/store";
import type { EntryLookupFn, LibraryEntry, SavedAnime } from "@/lib/store";
import { colors, radius, spacing, fontFamily } from "@/lib/theme";

/** Pause after the last key press before asking the server, so typing a title sends one request. */
const DEBOUNCE_MS = 400;
/** Shorter text only searches your own shows, unless you press the search key (anYme's rule). */
const ONLINE_MIN_LENGTH = 3;

const SITE_NAMES: Record<Source, string> = { anilist: "AniList", mal: "MyAnimeList" };

const styles = StyleSheet.create({
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    color: colors.text,
    fontFamily,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  notice: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  retry: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
});

/**
 * Both sections live in one list, so they scroll as one and FlashList recycles every row. Each
 * item says what it is, and `getItemType` lets FlashList reuse a row only for the same kind.
 */
type Item =
  | { kind: "heading"; key: string; title: string; busy: boolean }
  | { kind: "mine"; key: string; anime: AnimeSummary; entry?: LibraryEntry }
  | { kind: "online"; key: string; anime: AnimeSummary }
  | { kind: "notice"; key: string; text: string; retry: boolean };

interface Mine {
  anime: AnimeSummary;
  entry?: LibraryEntry;
  /** The library entry's key, or the bookmark's: what an online result is compared against. */
  key: string;
}

/**
 * Your shows (library first, then bookmarks not in it) whose titles match. Runs on every key
 * press: it is a pass over rows already in memory, so there is nothing to wait for.
 */
const findMine = (
  text: string,
  filters: SearchFilters,
  entries: readonly LibraryEntry[],
  bookmarks: readonly SavedAnime[],
  lookup: EntryLookupFn
): Mine[] => {
  if (text === "") {
    return [];
  }
  const saved: Mine[] = entries.map((entry) => ({ anime: entry.anime, entry, key: entry.key }));
  for (const bookmark of bookmarks) {
    if (lookup(bookmark.anime) === undefined) {
      saved.push({ anime: bookmark.anime, key: animeKey(bookmark.anime) });
    }
  }
  return matchTitles(
    saved.filter((item) => passesFilters(item.anime, filters)),
    text,
    (item) => item.anime
  );
};

interface OnlineState {
  /** "AniList" or "MyAnimeList": the site the online search asks. */
  site: string;
  enabled: boolean;
  /** Short text that will not be searched online until the search key is pressed. */
  waiting: boolean;
  fetching: boolean;
  failed: boolean;
  /** undefined until the first page arrives. */
  results?: AnimeSummary[];
}

/** The rows of the list: "Your shows", then "From AniList" (or MyAnimeList) without the shows already listed above. */
const buildItems = (mine: readonly Mine[], online: OnlineState, lookup: EntryLookupFn): Item[] => {
  const items: Item[] = [];
  if (mine.length > 0) {
    items.push({ busy: false, key: "h:mine", kind: "heading", title: `Your shows (${mine.length})` });
    for (const item of mine) {
      items.push({ anime: item.anime, entry: item.entry, key: `mine:${item.key}`, kind: "mine" });
    }
  }
  if (!online.enabled) {
    if (online.waiting) {
      items.push({
        key: "n:short",
        kind: "notice",
        retry: false,
        text: `Keep typing, or press search, to search ${online.site}`,
      });
    }
    return items;
  }
  items.push({ busy: online.fetching, key: "h:online", kind: "heading", title: `From ${online.site}` });
  if (online.failed && online.results === undefined) {
    items.push({ key: "n:error", kind: "notice", retry: true, text: `Could not reach ${online.site}` });
    return items;
  }
  const listed = new Set(mine.map((item) => item.key));
  let added = 0;
  for (const anime of online.results ?? []) {
    const key = lookup(anime)?.key ?? animeKey(anime);
    if (!listed.has(key)) {
      listed.add(key);
      items.push({ anime, key: `online:${animeKey(anime)}`, kind: "online" });
      added += 1;
    }
  }
  if (online.results !== undefined && added === 0) {
    items.push({ key: "n:none", kind: "notice", retry: false, text: `Nothing else found on ${online.site}` });
  }
  return items;
};

const Heading = ({ title, busy }: { title: string; busy: boolean }) => (
  <View style={styles.heading}>
    <AppText variant="label">{title}</AppText>
    {busy ? <ActivityIndicator color={colors.accent} size="small" /> : null}
  </View>
);

const Notice = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
  <View style={styles.notice}>
    <AppText variant="caption">{text}</AppText>
    {onRetry === undefined ? null : (
      <Touchable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <AppText variant="label">Try again</AppText>
      </Touchable>
    )}
  </View>
);

/** The text the online search uses: follows what you type after a pause, at once on submit. */
const useOnlineText = (typed: string) => {
  const [online, setOnline] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setOnline(typed.length >= ONLINE_MIN_LENGTH ? typed : "");
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [typed]);
  const submit = () => {
    setOnline(typed);
  };
  return [online, submit] as const;
};

/**
 * Search works like anYme's: your own shows (library and bookmarks) are filtered on every key
 * press, with no network and no wait, and online results fill in below them a moment later.
 */
const SearchScreen = () => {
  const params = useLocalSearchParams<{ advanced?: string }>();
  const { source } = useSettings();
  const genres = useGenres(source);
  const entries = useEntries();
  const bookmarks = useBookmarks();
  const lookup = useEntryLookup();
  const [text, setText] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(params.advanced === "1");
  const typed = text.trim();
  const [onlineText, submit] = useOnlineText(typed);
  const site = SITE_NAMES[source];

  const enabled = onlineText !== "" || hasFilters(filters);
  const results = useSearch(source, { ...filters, query: onlineText === "" ? undefined : onlineText }, enabled);

  // No useMemo needed: the React Compiler memoizes these, so they rerun only when their inputs change.
  const mine = findMine(typed, filters, entries, bookmarks, lookup);
  const items = buildItems(
    mine,
    {
      enabled,
      failed: results.isError,
      fetching: results.isFetching,
      results: results.data?.pages.flatMap((page) => page.items),
      site,
      waiting: typed !== "",
    },
    lookup
  );

  const handleRetry = () => {
    void results.refetch();
  };
  const handleEndReached = () => {
    if (enabled && results.hasNextPage && !results.isFetchingNextPage) {
      void results.fetchNextPage();
    }
  };

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === "heading") {
      return <Heading busy={item.busy} title={item.title} />;
    }
    if (item.kind === "notice") {
      return <Notice onRetry={item.retry ? handleRetry : undefined} text={item.text} />;
    }
    // "mine" rows show where the show sits in your list; online rows show progress if it is in it.
    const entry = item.kind === "mine" ? item.entry : lookup(item.anime);
    let label: string | undefined;
    if (item.kind === "mine") {
      label = entry === undefined ? "Saved" : WATCH_STATUS_LABELS[entry.status];
    }
    return (
      <AnimeRow
        anime={item.anime}
        onPress={() => {
          openAnime(item.anime);
        }}
        posterLabel={label}
        progress={entry?.progress}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        actions={[
          {
            icon: showFilters ? "options" : "options-outline",
            label: "Filters",
            onPress: () => {
              setShowFilters(!showFilters);
            },
          },
        ]}
        leading={{
          icon: "arrow-back",
          label: "Back",
          onPress: () => {
            router.back();
          },
        }}
        title="Search"
      />
      <TextInput
        accessibilityLabel="Search anime"
        autoFocus={!showFilters}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder={`Search your shows and ${site}…`}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.input}
        value={text}
      />
      <RowList
        data={items}
        empty={<EmptyState icon="search-outline" title={`Search your shows and ${site}`} />}
        getItemType={(item) => item.kind}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.key}
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.accent} /> : undefined}
        ListHeaderComponent={
          showFilters ? <FilterChips genres={genres.data ?? []} onChange={setFilters} value={filters} /> : undefined
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        renderItem={renderItem}
      />
    </View>
  );
};

export default SearchScreen;

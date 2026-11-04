import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { OptionsSheet } from "@/components/options-sheet";
import { PagerTabs } from "@/components/pager-tabs";
import { useSideMenu } from "@/components/side-menu";
import { EmptyState } from "@/components/states";
import { AppText } from "@/components/text";
import { UpdateSheet } from "@/components/update-sheet";
import { watchNextEpisode } from "@/lib/episodes";
import { duration } from "@/lib/motion";
import { openAnime } from "@/lib/nav";
import { getProvider } from "@/lib/sources";
import { displayTitle, useLibrary, useLibraryActions, WATCH_STATUS_LABELS, WATCH_STATUSES } from "@/lib/store";
import type { LibraryEntry, WatchStatus } from "@/lib/store";
import { pullQuietly } from "@/lib/sync";
import { colors, radius, spacing } from "@/lib/theme";

/** Most shows refreshed per pull-to-refresh. */
const REFRESH_LIMIT = 15;

type SortKey = "updated" | "title" | "score" | "start";

const SORT_LABELS: Record<SortKey, string> = {
  score: "Your score",
  start: "Start date",
  title: "Title",
  updated: "Last updated",
};

const SORT_KEYS: SortKey[] = ["updated", "title", "score", "start"];

const sorters: Record<SortKey, (a: LibraryEntry, b: LibraryEntry) => number> = {
  score: (a, b) => b.score - a.score,
  start: (a, b) => (b.anime.airedFrom ?? "").localeCompare(a.anime.airedFrom ?? ""),
  title: (a, b) => a.anime.title.localeCompare(b.anime.title),
  updated: (a, b) => b.updatedAt - a.updatedAt,
};

const styles = StyleSheet.create({
  filter: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    color: colors.text,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.md },
  screen: { backgroundColor: colors.background, flex: 1 },
  sheetTitle: { paddingBottom: spacing.md, paddingHorizontal: spacing.xl },
});

const useRefreshLibrary = () => {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const { entries, refreshSnapshots } = useLibrary.getState();
    // Only shows you are watching that can still change, newest first: a big imported
    // list must not queue hundreds of requests in front of what you open next.
    const stale = Object.values(entries)
      .filter(
        (entry) => entry.status === "watching" && (entry.anime.status === "airing" || entry.anime.status === "upcoming")
      )
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, REFRESH_LIMIT);
    // allSettled never rejects: one failing show must not stop the others from refreshing.
    const results = await Promise.allSettled(
      stale.map(async (entry) => await getProvider(entry.anime.source).getAnime(entry.anime.id))
    );
    refreshSnapshots(results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
    // Pull changes made on AniList / MyAnimeList; failures show up in Settings.
    await pullQuietly();
    setRefreshing(false);
  };
  return { refresh, refreshing };
};

interface StatusListProps {
  status: WatchStatus;
  entries: LibraryEntry[];
  refreshing: boolean;
  onRefresh: () => void;
  onMore: (entry: LibraryEntry) => void;
}

/** One status page. Rows slide into place when the order changes (250 ms, like RecyclerView). */
const StatusList = ({ status, entries, refreshing, onRefresh, onMore }: StatusListProps) => (
  <Animated.FlatList
    contentContainerStyle={styles.list}
    data={entries}
    itemLayoutAnimation={LinearTransition.duration(duration.itemMove)}
    keyExtractor={(entry) => entry.key}
    ListEmptyComponent={
      <EmptyState
        icon="albums-outline"
        message="Find shows in Discover or search, then add them to your list."
        title={`Nothing in ${WATCH_STATUS_LABELS[status]}`}
      />
    }
    onRefresh={onRefresh}
    refreshing={refreshing}
    renderItem={({ item }) => (
      <AnimeRow
        anime={item.anime}
        onMore={() => {
          onMore(item);
        }}
        onPress={() => {
          openAnime(item.anime);
        }}
        progress={item.progress}
      />
    )}
  />
);

const HomeScreen = () => {
  const entries = useLibrary((state) => state.entries);
  const language = useLibrary((state) => state.settings.titleLanguage);
  const { toggleBookmark, update, remove } = useLibraryActions();
  const openMenu = useSideMenu((state) => state.setOpen);
  const [tab, setTab] = useState<WatchStatus>("watching");
  const [sort, setSort] = useState<SortKey>("updated");
  const [filter, setFilter] = useState<string | undefined>();
  const [sortOpen, setSortOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<LibraryEntry | undefined>();
  const [editing, setEditing] = useState<LibraryEntry | undefined>();
  const { refresh, refreshing } = useRefreshLibrary();

  const all = useMemo(() => Object.values(entries), [entries]);
  const counts = useMemo(() => {
    const result: Record<WatchStatus, number> = { completed: 0, dropped: 0, onHold: 0, planned: 0, watching: 0 };
    for (const entry of all) {
      result[entry.status] += 1;
    }
    return result;
  }, [all]);

  const lists = useMemo(() => {
    const needle = filter?.trim().toLowerCase() ?? "";
    const matches = (entry: LibraryEntry): boolean =>
      needle === "" ||
      [entry.anime.title, entry.anime.titleEnglish ?? "", ...entry.anime.synonyms].some((title) =>
        title.toLowerCase().includes(needle)
      );
    const result: Record<WatchStatus, LibraryEntry[]> = {
      completed: [],
      dropped: [],
      onHold: [],
      planned: [],
      watching: [],
    };
    for (const entry of all) {
      if (matches(entry)) {
        result[entry.status].push(entry);
      }
    }
    for (const status of WATCH_STATUSES) {
      result[status].sort(sorters[sort]);
    }
    return result;
  }, [all, filter, sort]);

  return (
    <View style={styles.screen}>
      <Header
        actions={[
          {
            icon: "refresh",
            label: "Refresh list",
            onPress: () => {
              void refresh();
            },
          },
          {
            icon: filter === undefined ? "search" : "close",
            label: "Filter my shows",
            onPress: () => {
              setFilter(filter === undefined ? "" : undefined);
            },
          },
          {
            icon: "filter",
            label: "Sort",
            onPress: () => {
              setSortOpen(true);
            },
          },
        ]}
        leading={{
          icon: "menu",
          label: "Open menu",
          onPress: () => {
            openMenu(true);
          },
        }}
        right={refreshing ? <ActivityIndicator color={colors.accent} /> : null}
        title="Home"
      />
      {filter === undefined ? null : (
        <TextInput
          accessibilityLabel="Filter my shows"
          autoFocus
          onChangeText={setFilter}
          placeholder="Filter my shows…"
          placeholderTextColor={colors.textSubtle}
          style={styles.filter}
          value={filter}
        />
      )}
      <PagerTabs
        onChange={setTab}
        renderPage={(status) => (
          <StatusList
            entries={lists[status]}
            onMore={setMenuFor}
            onRefresh={() => {
              void refresh();
            }}
            refreshing={refreshing}
            status={status}
          />
        )}
        tabs={WATCH_STATUSES.map((status) => ({
          key: status,
          label: `${WATCH_STATUS_LABELS[status]} (${counts[status]})`,
        }))}
        value={tab}
      />
      <OptionsSheet
        items={SORT_KEYS.map((key) => ({
          icon: sort === key ? "radio-button-on" : "radio-button-off",
          label: SORT_LABELS[key],
          onPress: () => {
            setSort(key);
          },
        }))}
        onClose={() => {
          setSortOpen(false);
        }}
        visible={sortOpen}
      />

      <OptionsSheet
        header={
          menuFor === undefined ? null : (
            <AppText numberOfLines={2} style={styles.sheetTitle} variant="caption">
              {displayTitle(menuFor.anime, language)}
            </AppText>
          )
        }
        items={
          menuFor === undefined
            ? []
            : [
                {
                  icon: "add-circle-outline",
                  label: "+1 episode",
                  onPress: () => {
                    watchNextEpisode(menuFor.key);
                  },
                  tone: "accent",
                },
                {
                  icon: "create-outline",
                  label: "Update",
                  onPress: () => {
                    setEditing(menuFor);
                  },
                },
                ...WATCH_STATUSES.filter((status) => status !== menuFor.status).map((status, index) => ({
                  icon: "swap-horizontal" as const,
                  label: `Move to ${WATCH_STATUS_LABELS[status]}`,
                  onPress: () => {
                    update(menuFor.key, { status });
                  },
                  separated: index === 0,
                })),
                {
                  icon: "bookmark-outline",
                  label: "Toggle bookmark",
                  onPress: () => {
                    toggleBookmark(menuFor.anime);
                  },
                  separated: true,
                },
                {
                  icon: "trash-outline",
                  label: "Delete anime",
                  onPress: () => {
                    remove(menuFor.key);
                  },
                  tone: "danger",
                },
              ]
        }
        onClose={() => {
          setMenuFor(undefined);
        }}
        visible={menuFor !== undefined}
      />

      {editing === undefined ? null : (
        <UpdateSheet
          anime={editing.anime}
          onClose={() => {
            setEditing(undefined);
          }}
          visible
        />
      )}
    </View>
  );
};

export default HomeScreen;

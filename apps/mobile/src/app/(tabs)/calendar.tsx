import { Ionicons } from "@expo/vector-icons";
import { estimateNextEpisode, formatCountdown } from "@ikuzo/anime/airing";
import type { AnimeSummary } from "@ikuzo/anime/types";
import { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { PagerTabs } from "@/components/pager-tabs";
import { useSideMenu } from "@/components/side-menu";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { formatAirTime } from "@/lib/format";
import { openAnime } from "@/lib/nav";
import { ensurePermission } from "@/lib/notifications";
import { useLibraryAiring, useSchedule } from "@/lib/queries";
import { animeKey, entryKeyFor, library, useEntry, useSettings } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type DayKey = (typeof DAYS)[number];
type CalendarTab = "mine" | DayKey;

const DAYS_FROM_MONDAY: readonly DayKey[] = [...DAYS.slice(1), "sunday"];

const CALENDAR_TABS: { key: CalendarTab; label: string }[] = [
  { key: "mine", label: "My shows" },
  ...DAYS_FROM_MONDAY.map((day) => ({ key: day, label: day })),
];

const styles = StyleSheet.create({
  footer: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  list: { flexGrow: 1, gap: 10, paddingVertical: 10 },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const BellButton = ({ anime }: { anime: AnimeSummary }) => {
  const entry = useEntry(anime);
  const active = entry?.notify === true;

  const toggle = async () => {
    if (!active && !(await ensurePermission())) {
      Alert.alert(
        "Notifications are off",
        "Allow notifications for Ikuzo in your system settings to get episode alerts."
      );
      return;
    }
    if (entry === undefined) {
      library.save(anime, { status: "planned" });
    }
    library.update(entryKeyFor(anime), { notify: !active });
  };

  return (
    <Touchable
      accessibilityLabel={active ? "Stop episode notifications" : "Notify me about new episodes"}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      hitSlop={10}
      onPress={() => {
        void toggle();
      }}
    >
      <Ionicons
        color={active ? colors.accent : colors.text}
        name={active ? "notifications" : "notifications-outline"}
        size={24}
      />
    </Touchable>
  );
};

const AiringFooter = ({ airingAt, now }: { airingAt: number; now: number }) => (
  <View style={styles.footer}>
    <AppText variant="label">{formatAirTime(airingAt)}</AppText>
    <AppText color={colors.accent} variant="label">
      {formatCountdown(airingAt - now)}
    </AppText>
  </View>
);

const MyShows = () => {
  const airing = useLibraryAiring();
  const hideUpcoming = useSettings().calendarHideUpcoming;
  const now = useNow();
  if (airing.isPending) {
    return <Loading />;
  }
  if (airing.isError) {
    return (
      <ErrorState
        error={airing.error}
        onRetry={() => {
          void airing.refetch();
        }}
      />
    );
  }
  const items = (airing.data ?? []).filter((item) => !hideUpcoming || item.entry.anime.status === "airing");
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(item) => item.entry.key}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          message="Airing shows in your Watching, Plan to watch and On hold lists appear here."
          title="No upcoming episodes"
        />
      }
      onRefresh={() => {
        void airing.refetch();
      }}
      refreshing={airing.isRefetching}
      renderItem={({ item }) => (
        <AnimeRow
          anime={item.entry.anime}
          footer={<AiringFooter airingAt={item.airingAt} now={now} />}
          onPress={() => {
            openAnime(item.entry.anime);
          }}
          showStatus={false}
          titleLines={2}
          posterLabel={`EP${item.episode}`}
          trailing={<BellButton anime={item.entry.anime} />}
        />
      )}
    />
  );
};

const DaySchedule = ({ day }: { day: number }) => {
  const { source } = useSettings();
  const schedule = useSchedule(source, day);
  const now = useNow();
  const rows = useMemo(
    () =>
      (schedule.data ?? [])
        .map((anime) => ({ anime, next: estimateNextEpisode(anime, now) }))
        .toSorted(
          (a, b) => (a.next?.airingAt ?? Number.POSITIVE_INFINITY) - (b.next?.airingAt ?? Number.POSITIVE_INFINITY)
        ),
    [schedule.data, now]
  );
  if (schedule.isPending) {
    return <Loading />;
  }
  if (schedule.isError) {
    return (
      <ErrorState
        error={schedule.error}
        onRetry={() => {
          void schedule.refetch();
        }}
      />
    );
  }
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(row) => animeKey(row.anime)}
      ListEmptyComponent={<EmptyState icon="moon-outline" title="Nothing scheduled" />}
      onRefresh={() => {
        void schedule.refetch();
      }}
      refreshing={schedule.isRefetching}
      renderItem={({ item }) => (
        <AnimeRow
          anime={item.anime}
          footer={item.next === undefined ? undefined : <AiringFooter airingAt={item.next.airingAt} now={now} />}
          onPress={() => {
            openAnime(item.anime);
          }}
          showStatus={false}
          titleLines={2}
          posterLabel={item.next === undefined ? undefined : `EP${item.next.episode}`}
          trailing={<BellButton anime={item.anime} />}
        />
      )}
    />
  );
};

const CalendarScreen = () => {
  const openMenu = useSideMenu((state) => state.setOpen);
  const [tab, setTab] = useState<CalendarTab>("mine");

  return (
    <View style={styles.screen}>
      <Header
        actions={[
          {
            icon: "today-outline",
            label: "Today",
            onPress: () => {
              setTab(DAYS[new Date().getDay()] ?? "monday");
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
        title="Calendar"
      />
      <PagerTabs
        onChange={setTab}
        renderPage={(page) => (page === "mine" ? <MyShows /> : <DaySchedule day={DAYS.indexOf(page)} />)}
        tabs={CALENDAR_TABS}
        value={tab}
      />
    </View>
  );
};

export default CalendarScreen;

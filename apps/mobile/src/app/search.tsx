import type { AiringStatus, MediaFormat, SearchParams, SortOrder } from "@ikuzo/anime/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { AnimeResults } from "@/components/anime-results";
import { ChipRow } from "@/components/chips";
import type { ChipOption } from "@/components/chips";
import { Header } from "@/components/header";
import { useGenres, useSearch } from "@/lib/queries";
import { useLibrary } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const DEBOUNCE_MS = 400;
const YEARS_BACK = 40;

const FORMAT_VALUES: MediaFormat[] = ["TV", "Movie", "OVA", "ONA", "Special", "TV Short", "Music"];
const FORMATS: ChipOption<MediaFormat>[] = FORMAT_VALUES.map((format) => ({ label: format, value: format }));

const STATUSES: ChipOption<AiringStatus>[] = [
  { label: "Airing", value: "airing" },
  { label: "Finished", value: "finished" },
  { label: "Not yet aired", value: "upcoming" },
];

const SORTS: ChipOption<SortOrder>[] = [
  { label: "Popularity", value: "popularity" },
  { label: "Score", value: "score" },
  { label: "Newest", value: "start_date" },
  { label: "Title", value: "title" },
];

const thisYear = new Date().getFullYear();
const YEARS: ChipOption<number>[] = Array.from({ length: YEARS_BACK }, (_, index) => thisYear + 1 - index).map(
  (year) => ({
    label: String(year),
    value: year,
  })
);

const styles = StyleSheet.create({
  filters: { gap: spacing.sm, paddingBottom: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    color: colors.text,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const toggleSingle = <T,>(current: T | undefined, value: T): T | undefined => (current === value ? undefined : value);

const useDebounced = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
};

const SearchScreen = () => {
  const params = useLocalSearchParams<{ advanced?: string }>();
  const source = useLibrary((state) => state.settings.source);
  const genres = useGenres(source);
  const [text, setText] = useState("");
  const [showFilters, setShowFilters] = useState(params.advanced === "1");
  const [format, setFormat] = useState<MediaFormat | undefined>();
  const [status, setStatus] = useState<AiringStatus | undefined>();
  const [sort, setSort] = useState<SortOrder | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const query = useDebounced(text.trim(), DEBOUNCE_MS);

  const search: SearchParams = useMemo(
    () => ({ format, genres: selectedGenres, query: query === "" ? undefined : query, sort, status, year }),
    [format, query, selectedGenres, sort, status, year]
  );
  const hasCriteria =
    query !== "" ||
    format !== undefined ||
    status !== undefined ||
    year !== undefined ||
    selectedGenres.length > 0 ||
    sort !== undefined;
  const results = useSearch(source, search, hasCriteria);

  const filters = showFilters ? (
    <View style={styles.filters}>
      <ChipRow
        label="Sort"
        onToggle={(value) => {
          setSort(toggleSingle(sort, value));
        }}
        options={SORTS}
        selected={sort === undefined ? [] : [sort]}
      />
      <ChipRow
        label="Format"
        onToggle={(value) => {
          setFormat(toggleSingle(format, value));
        }}
        options={FORMATS}
        selected={format === undefined ? [] : [format]}
      />
      <ChipRow
        label="Status"
        onToggle={(value) => {
          setStatus(toggleSingle(status, value));
        }}
        options={STATUSES}
        selected={status === undefined ? [] : [status]}
      />
      <ChipRow
        label="Year"
        onToggle={(value) => {
          setYear(toggleSingle(year, value));
        }}
        options={YEARS}
        selected={year === undefined ? [] : [year]}
      />
      <ChipRow
        label="Genres"
        onToggle={(value) => {
          setSelectedGenres(
            selectedGenres.includes(value)
              ? selectedGenres.filter((genre) => genre !== value)
              : [...selectedGenres, value]
          );
        }}
        options={(genres.data ?? []).map((genre) => ({ label: genre, value: genre }))}
        selected={selectedGenres}
      />
    </View>
  ) : undefined;

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
        placeholder="Search anime…"
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.input}
        value={text}
      />
      <AnimeResults
        emptyTitle={hasCriteria ? "No anime found" : "Type a title or pick filters"}
        header={filters}
        query={results}
      />
    </View>
  );
};

export default SearchScreen;

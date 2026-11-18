import type { AiringStatus, AnimeSummary, MediaFormat, SortOrder } from "@ikuzo/anime/types";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/lib/theme";

import { ChipRow } from "./chips";
import type { ChipOption } from "./chips";

export interface SearchFilters {
  format?: MediaFormat;
  status?: AiringStatus;
  year?: number;
  sort?: SortOrder;
  genres: string[];
}

export const NO_FILTERS: SearchFilters = { genres: [] };

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
  (year) => ({ label: String(year), value: year })
);

const styles = StyleSheet.create({
  filters: { gap: spacing.sm, paddingBottom: spacing.sm },
});

const toggleSingle = <T,>(current: T | undefined, value: T): T | undefined => (current === value ? undefined : value);
const asList = <T,>(value: T | undefined): T[] => (value === undefined ? [] : [value]);

export const hasFilters = (filters: SearchFilters): boolean =>
  filters.format !== undefined ||
  filters.status !== undefined ||
  filters.year !== undefined ||
  filters.sort !== undefined ||
  filters.genres.length > 0;

/** The filters the server applies, run on your own shows so both sections agree. */
export const passesFilters = (anime: AnimeSummary, filters: SearchFilters): boolean =>
  (filters.format === undefined || anime.format === filters.format) &&
  (filters.status === undefined || anime.status === filters.status) &&
  (filters.year === undefined || anime.year === filters.year) &&
  filters.genres.every((genre) => anime.genres.includes(genre));

interface FilterChipsProps {
  value: SearchFilters;
  onChange: (next: SearchFilters) => void;
  genres: readonly string[];
}

/** The advanced-search chip rows. One state object in, one out: the screen keeps a single useState. */
export const FilterChips = ({ value, onChange, genres }: FilterChipsProps) => (
  <View style={styles.filters}>
    <ChipRow
      label="Sort"
      onToggle={(sort) => {
        onChange({ ...value, sort: toggleSingle(value.sort, sort) });
      }}
      options={SORTS}
      selected={asList(value.sort)}
    />
    <ChipRow
      label="Format"
      onToggle={(format) => {
        onChange({ ...value, format: toggleSingle(value.format, format) });
      }}
      options={FORMATS}
      selected={asList(value.format)}
    />
    <ChipRow
      label="Status"
      onToggle={(status) => {
        onChange({ ...value, status: toggleSingle(value.status, status) });
      }}
      options={STATUSES}
      selected={asList(value.status)}
    />
    <ChipRow
      label="Year"
      onToggle={(year) => {
        onChange({ ...value, year: toggleSingle(value.year, year) });
      }}
      options={YEARS}
      selected={asList(value.year)}
    />
    <ChipRow
      label="Genres"
      onToggle={(genre) => {
        onChange({
          ...value,
          genres: value.genres.includes(genre)
            ? value.genres.filter((selected) => selected !== genre)
            : [...value.genres, genre],
        });
      }}
      options={genres.map((genre) => ({ label: genre, value: genre }))}
      selected={value.genres}
    />
  </View>
);

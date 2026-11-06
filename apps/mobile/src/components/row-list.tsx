import { FlashList } from "@shopify/flash-list";
import type { FlashListProps } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

const styles = StyleSheet.create({
  empty: { paddingTop: 80 },
  list: { paddingVertical: 10 },
  separator: { height: 10 },
});

const Separator = () => <View style={styles.separator} />;

interface RowListProps<T> extends Omit<FlashListProps<T>, "ListEmptyComponent"> {
  empty?: ReactElement;
}

/**
 * The scrolling list for anime rows. FlashList recycles rows instead of creating new ones as you
 * scroll, which keeps lists of a thousand shows smooth.
 */
export const RowList = <T,>({ empty, ...props }: RowListProps<T>) => (
  <FlashList
    contentContainerStyle={styles.list}
    ItemSeparatorComponent={Separator}
    ListEmptyComponent={empty === undefined ? undefined : <View style={styles.empty}>{empty}</View>}
    {...props}
  />
);

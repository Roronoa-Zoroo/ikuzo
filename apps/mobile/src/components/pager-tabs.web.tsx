import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { TabStrip } from "./tab-strip";
import type { TabItem } from "./tab-strip";

interface PagerTabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  renderPage: (key: T) => ReactNode;
}

const styles = StyleSheet.create({ root: { flex: 1 } });

/** Web has no native pager: tabs switch pages without the swipe. */
export const PagerTabs = <T extends string>({ tabs, value, onChange, renderPage }: PagerTabsProps<T>) => (
  <View style={styles.root}>
    <TabStrip onChange={onChange} tabs={tabs} value={value} />
    <View key={value} style={styles.root}>
      {renderPage(value)}
    </View>
  </View>
);

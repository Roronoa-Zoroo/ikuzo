import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useSharedValue } from "react-native-reanimated";

import { TabStrip } from "./tab-strip";
import type { TabItem } from "./tab-strip";

interface PagerTabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  renderPage: (key: T) => ReactNode;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pager: { flex: 1 },
  root: { flex: 1 },
});

/**
 * Top tabs over swipeable pages (anYme's TabLayout + ViewPager). The underline
 * follows the finger; a page is only rendered once it, or a neighbour, is visited.
 */
export const PagerTabs = <T extends string>({ tabs, value, onChange, renderPage }: PagerTabsProps<T>) => {
  const pagerRef = useRef<PagerView>(null);
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value)
  );
  const position = useSharedValue(index);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([index - 1, index, index + 1]));
  const settled = useRef(index);

  const markVisited = (page: number) => {
    setVisited((current) => (current.has(page) ? current : new Set([...current, page - 1, page, page + 1])));
  };

  // A tab chosen outside the pager (tab strip tap, "Today" button) moves the pager.
  useEffect(() => {
    if (settled.current !== index) {
      settled.current = index;
      pagerRef.current?.setPage(index);
    }
  }, [index]);

  return (
    <View style={styles.root}>
      <TabStrip
        onChange={(key) => {
          markVisited(tabs.findIndex((tab) => tab.key === key));
          onChange(key);
        }}
        position={position}
        tabs={tabs}
        value={value}
      />
      <PagerView
        initialPage={index}
        offscreenPageLimit={1}
        onPageScroll={(event) => {
          position.set(event.nativeEvent.position + event.nativeEvent.offset);
        }}
        onPageSelected={(event) => {
          const page = event.nativeEvent.position;
          const tab = tabs[page];
          settled.current = page;
          markVisited(page);
          if (tab !== undefined && tab.key !== value) {
            onChange(tab.key);
          }
        }}
        ref={pagerRef}
        style={styles.pager}
      >
        {tabs.map((tab, tabIndex) => (
          <View collapsable={false} key={tab.key} style={styles.page}>
            {visited.has(tabIndex) ? renderPage(tab.key) : null}
          </View>
        ))}
      </PagerView>
    </View>
  );
};

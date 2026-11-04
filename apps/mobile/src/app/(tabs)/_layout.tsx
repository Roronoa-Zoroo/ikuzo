import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { SideMenu } from "@/components/side-menu";
import { duration } from "@/lib/motion";
import { colors, fontFamily } from "@/lib/theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface TabIconProps {
  color: ColorValue;
  size: number;
  name: IconName;
}

const TabIcon = ({ color, size, name }: TabIconProps) => (
  <MaterialCommunityIcons color={typeof color === "string" ? color : colors.textSubtle} name={name} size={size + 2} />
);

/** One named icon component per tab; like anYme's bottom bar only the colour changes when selected. */
const makeTabIcon = (name: IconName) => {
  const Icon = ({ color, size }: Omit<TabIconProps, "name">) => <TabIcon color={color} name={name} size={size} />;
  Icon.displayName = `TabIcon(${name})`;
  return Icon;
};

const TABS = [
  { icon: makeTabIcon("home"), name: "index", title: "Home" },
  { icon: makeTabIcon("bookmark-multiple-outline"), name: "bookmarks", title: "Bookmarks" },
  { icon: makeTabIcon("compass"), name: "discover", title: "Discover" },
  { icon: makeTabIcon("calendar-month-outline"), name: "calendar", title: "Calendar" },
  { icon: makeTabIcon("chart-box"), name: "stats", title: "Stats" },
] as const;

const TabsLayout = () => (
  <>
    <Tabs
      screenOptions={{
        // anYme cross-faded between bottom tabs over 400 ms (xfade_in / xfade_out).
        animation: "fade",
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontFamily, fontSize: 13, fontWeight: "500" },
        // Same colour as the page and no divider, like AHBottomNavigation in anYme.
        tabBarStyle: { backgroundColor: colors.background, borderTopWidth: 0, elevation: 8, height: 64, paddingTop: 6 },
        transitionSpec: { animation: "timing", config: { duration: duration.crossfade } },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarIcon: tab.icon,
            title: tab.title,
          }}
        />
      ))}
    </Tabs>
    <SideMenu />
  </>
);

export default TabsLayout;

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { SideMenu } from "@/components/side-menu";
import { colors } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

interface TabIconProps {
  color: ColorValue;
  focused: boolean;
  size: number;
  active: IconName;
  idle: IconName;
}

const TabIcon = ({ color, focused, size, active, idle }: TabIconProps) => (
  <Ionicons color={typeof color === "string" ? color : colors.textSubtle} name={focused ? active : idle} size={size} />
);

/** One named icon component per tab, created once at module load. */
const makeTabIcon = (active: IconName, idle: IconName) => {
  const Icon = ({ color, focused, size }: Omit<TabIconProps, "active" | "idle">) => (
    <TabIcon active={active} color={color} focused={focused} idle={idle} size={size} />
  );
  Icon.displayName = `TabIcon(${active})`;
  return Icon;
};

const TABS = [
  { icon: makeTabIcon("home", "home-outline"), name: "index", title: "Home" },
  { icon: makeTabIcon("bookmarks", "bookmarks-outline"), name: "bookmarks", title: "Bookmarks" },
  { icon: makeTabIcon("compass", "compass-outline"), name: "discover", title: "Discover" },
  { icon: makeTabIcon("calendar", "calendar-outline"), name: "calendar", title: "Calendar" },
  { icon: makeTabIcon("stats-chart", "stats-chart-outline"), name: "stats", title: "Stats" },
] as const;

const TabsLayout = () => (
  <>
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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

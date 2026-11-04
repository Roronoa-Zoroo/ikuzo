import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Ionicons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;
type MaterialName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Screens name icons in Ionicons terms; they are drawn as Material Design
 * icons, which is the icon language of anYme's Material UI.
 */
const MATERIAL: Partial<Record<IconName, MaterialName>> = {
  "add-circle-outline": "plus",
  "arrow-back": "arrow-left",
  "arrow-forward": "arrow-right",
  bookmark: "bookmark-multiple",
  "bookmark-outline": "bookmark-multiple-outline",
  "calendar-outline": "calendar-month",
  "chevron-back": "chevron-left",
  "chevron-forward": "chevron-right",
  close: "close",
  "copy-outline": "content-copy",
  "create-outline": "pencil",
  filter: "sort-variant",
  heart: "heart",
  "heart-outline": "heart-outline",
  "logo-github": "github",
  menu: "menu",
  "open-outline": "open-in-new",
  options: "tune-variant",
  "options-outline": "tune",
  "pricetags-outline": "tag-multiple",
  "radio-button-off": "radiobox-blank",
  "radio-button-on": "radiobox-marked",
  refresh: "refresh",
  search: "magnify",
  "settings-outline": "cog",
  "share-social-outline": "share-variant",
  shuffle: "shuffle-variant",
  "swap-horizontal": "swap-horizontal",
  text: "format-size",
  "thumbs-up-outline": "thumb-up-outline",
  "today-outline": "calendar-today",
  trash: "delete",
  "trash-outline": "delete",
};

interface MaterialIconProps {
  name: IconName;
  size: number;
  color: string;
  style?: React.ComponentProps<typeof MaterialCommunityIcons>["style"];
}

export const MaterialIcon = ({ name, size, color, style }: MaterialIconProps) => (
  <MaterialCommunityIcons color={color} name={MATERIAL[name] ?? "circle-small"} size={size} style={style} />
);

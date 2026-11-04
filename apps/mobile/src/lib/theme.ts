import { Platform } from "react-native";

/**
 * Google Sans, embedded by the expo-font config plugin. Android registers one
 * family with all weights; iOS uses the font's own family name. Web falls back
 * to the system font.
 */
export const fontFamily = Platform.select({ android: "GoogleSans", default: undefined, ios: "Google Sans" });

/** Dark navy palette: easy on the eyes for late-night episode tracking. */
export const colors = {
  /** theme_NightBlue_accent */
  accent: "#42a5f5",
  accentMuted: "#173b5e",
  /** custom_background */
  background: "#111a29",
  border: "#243149",
  /** card_background */
  card: "#172233",
  cardPressed: "#1e2b40",
  danger: "#ef5350",
  overlay: "rgba(5, 9, 18, 0.72)",
  /** colorPrimary: filled buttons */
  primary: "#2196f3",
  ripple: "rgba(238, 242, 251, 0.12)",
  success: "#4caf7d",
  surface: "#141f31",
  /** textColor_light_mode (88% white) */
  text: "rgba(255, 255, 255, 0.88)",
  textMuted: "#9aa6bf",
  textStrong: "#ffffff",
  textSubtle: "#6c7893",
  warning: "#f5a524",
} as const;

export const spacing = {
  lg: 16,
  md: 12,
  sm: 8,
  xl: 24,
  xs: 4,
} as const;

export const radius = {
  lg: 16,
  md: 12,
  pill: 999,
  sm: 8,
} as const;

export const fontSize = {
  lg: 18,
  md: 15,
  sm: 13,
  title: 22,
  xl: 20,
  xs: 11,
} as const;

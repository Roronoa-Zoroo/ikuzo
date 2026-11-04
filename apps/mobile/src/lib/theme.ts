/** Dark navy palette: easy on the eyes for late-night episode tracking. */
export const colors = {
  accent: "#3d8bfd",
  accentMuted: "#1c3a66",
  background: "#0f1626",
  border: "#26324a",
  card: "#18223a",
  cardPressed: "#202c47",
  danger: "#ef5350",
  overlay: "rgba(5, 9, 18, 0.72)",
  success: "#4caf7d",
  surface: "#131c30",
  text: "#eef2fb",
  textMuted: "#9aa6bf",
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

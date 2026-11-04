import { Text } from "react-native";
import type { TextProps } from "react-native";

import { colors, fontFamily, fontSize } from "@/lib/theme";

type Variant = "title" | "heading" | "body" | "label" | "caption";

const VARIANTS: Record<Variant, { fontSize: number; fontWeight: "400" | "500" | "600" | "700"; color: string }> = {
  body: { color: colors.text, fontSize: fontSize.md, fontWeight: "400" },
  caption: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "400" },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: "700" },
  label: { color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: "700" },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export const AppText = ({ variant = "body", color, style, ...props }: AppTextProps) => (
  <Text style={[{ fontFamily }, VARIANTS[variant], color === undefined ? null : { color }, style]} {...props} />
);

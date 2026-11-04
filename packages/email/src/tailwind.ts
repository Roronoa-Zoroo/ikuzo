import { pixelBasedPreset, type TailwindConfig } from "react-email";

export const tailwindConfig: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        brand: "#171717",
        canvas: "#f4f4f5",
        ink: "#18181b",
        line: "#e4e4e7",
        muted: "#71717a",
        surface: "#ffffff",
      },
    },
  },
};

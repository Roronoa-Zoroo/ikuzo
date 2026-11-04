import type { ConfigContext, ExpoConfig } from "expo/config";

import { withAniDbCleartext } from "./plugins/with-anidb-cleartext.ts";

const BACKGROUND = "#0f1626";
const BUNDLE_ID = "io.github.roronoazoroo.ikuzo";

const config = ({ config: base }: ConfigContext): ExpoConfig =>
  withAniDbCleartext({
    ...base,
    android: {
      adaptiveIcon: {
        backgroundColor: BACKGROUND,
        backgroundImage: "./assets/android-icon-background.png",
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      package: BUNDLE_ID,
      predictiveBackGestureEnabled: false,
    },
    backgroundColor: BACKGROUND,
    experiments: { typedRoutes: true },
    icon: "./assets/icon.png",
    ios: {
      bundleIdentifier: BUNDLE_ID,
      infoPlist: {
        // AniDB's API is HTTP-only; allow it and nothing else.
        NSAppTransportSecurity: {
          NSExceptionDomains: {
            "api.anidb.net": { NSExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: false },
          },
        },
      },
      supportsTablet: true,
    },
    name: "Ikuzo",
    orientation: "portrait",
    plugins: [
      "expo-router",
      "expo-status-bar",
      "expo-image",
      "expo-sqlite",
      "expo-web-browser",
      ["expo-notifications", { color: "#3d8bfd" }],
    ],
    scheme: "ikuzo",
    slug: "ikuzo",
    userInterfaceStyle: "dark",
    version: "0.1.0",
    web: { favicon: "./assets/favicon.png" },
  });

export default config;

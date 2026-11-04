import type { ConfigContext, ExpoConfig } from "expo/config";

import { withAniDbCleartext } from "./plugins/with-anidb-cleartext.ts";

const BACKGROUND = "#0f1626";
const GOOGLE_SANS = "./node_modules/@expo-google-fonts/google-sans";
const GOOGLE_SANS_WEIGHTS = ["400Regular", "500Medium", "600SemiBold", "700Bold"];
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
      [
        "expo-font",
        {
          // Google Sans (SIL OFL 1.1), the typeface anYme used, embedded at build time.
          android: {
            fonts: [
              {
                fontDefinitions: [
                  { path: `${GOOGLE_SANS}/400Regular/GoogleSans_400Regular.ttf`, weight: 400 },
                  { path: `${GOOGLE_SANS}/500Medium/GoogleSans_500Medium.ttf`, weight: 500 },
                  { path: `${GOOGLE_SANS}/600SemiBold/GoogleSans_600SemiBold.ttf`, weight: 600 },
                  { path: `${GOOGLE_SANS}/700Bold/GoogleSans_700Bold.ttf`, weight: 700 },
                ],
                fontFamily: "GoogleSans",
              },
            ],
          },
          ios: {
            fonts: GOOGLE_SANS_WEIGHTS.map((weight) => `${GOOGLE_SANS}/${weight}/GoogleSans_${weight}.ttf`),
          },
        },
      ],
      "expo-web-browser",
      "expo-sharing",
      // Status-bar icon: white 行 silhouette, tinted with the brand violet.
      ["expo-notifications", { color: "#7c3aed", icon: "./assets/notification-icon.png" }],
      ["expo-splash-screen", { backgroundColor: BACKGROUND, image: "./assets/splash-icon.png", imageWidth: 140 }],
    ],
    scheme: "ikuzo",
    slug: "ikuzo",
    userInterfaceStyle: "dark",
    version: "0.1.0",
    web: { favicon: "./assets/favicon.png" },
  });

export default config;

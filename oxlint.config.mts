import { defineConfig } from "oxlint";
import astro from "ultracite/oxlint/astro";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import reactNative from "ultracite/oxlint/react-native";

export default defineConfig({
  env: core.env,
  extends: [core, react, reactNative, astro],
  ignorePatterns: [...(core.ignorePatterns ?? []), ".agents/**"],
  options: { typeAware: true },
});

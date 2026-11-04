import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  astro: true,
  ignorePatterns: [...ultracite.ignorePatterns, ".agents/**", "**/*.hbs"],
  printWidth: 120,
});

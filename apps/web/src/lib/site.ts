import { ENV } from "../env.ts";

const TRAILING_SLASH = /\/$/;

export const SITE = {
  description: "A pnpm and Turborepo starter with Vite, TanStack Router, Hono, tRPC, Better Auth, MongoDB, and Redis.",
  locale: "en_US",
  name: "Starter",
  shortName: "Starter",
  tagline: "A production-ready TypeScript monorepo starter",
  themeColor: "#c45c26",
  themeColorDark: "#2a2118",
  themeColorLight: "#f7f1e8",
} as const;

export function pageTitle(page?: string): string {
  return page ? `${page} · ${SITE.name}` : SITE.name;
}

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = ENV.VITE_APP_URL?.replace(TRAILING_SLASH, "");

  if (base) {
    return `${base}${normalized}`;
  }

  if (typeof window !== "undefined") {
    return new URL(normalized, window.location.origin).href;
  }

  return normalized;
}

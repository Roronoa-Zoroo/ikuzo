import { absoluteUrl, pageTitle, SITE } from "@/lib/site";

type HeadMeta = {
  content?: string;
  media?: string;
  name?: string;
  property?: string;
  title?: string;
};

type HeadLink = {
  href: string;
  rel: string;
  sizes?: string;
  type?: string;
};

export function defaultHead() {
  const { description, locale, name, tagline, themeColorDark, themeColorLight } = SITE;
  const image = absoluteUrl("/og-image.png");
  const title = name;
  const url = absoluteUrl("/");

  return {
    links: [
      { href: "/favicon.svg?v=2", rel: "icon", type: "image/svg+xml" },
      { href: "/favicon-32x32.png?v=2", rel: "icon", sizes: "32x32", type: "image/png" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon" },
      { href: "/site.webmanifest", rel: "manifest" },
    ] satisfies HeadLink[],
    meta: [
      { title },
      { content: description, name: "description" },
      { content: name, name: "application-name" },
      { content: name, name: "apple-mobile-web-app-title" },
      { content: "yes", name: "apple-mobile-web-app-capable" },
      { content: "default", name: "apple-mobile-web-app-status-bar-style" },
      { content: themeColorLight, media: "(prefers-color-scheme: light)", name: "theme-color" },
      { content: themeColorDark, media: "(prefers-color-scheme: dark)", name: "theme-color" },
      { content: "website", property: "og:type" },
      { content: name, property: "og:site_name" },
      { content: title, property: "og:title" },
      { content: description, property: "og:description" },
      { content: image, property: "og:image" },
      { content: "1200", property: "og:image:width" },
      { content: "630", property: "og:image:height" },
      { content: `${name} — ${tagline}`, property: "og:image:alt" },
      { content: url, property: "og:url" },
      { content: locale, property: "og:locale" },
      { content: "summary_large_image", name: "twitter:card" },
      { content: title, name: "twitter:title" },
      { content: description, name: "twitter:description" },
      { content: image, name: "twitter:image" },
    ] satisfies HeadMeta[],
  };
}

export function pageHead({
  description,
  noIndex = false,
  title,
}: {
  description?: string;
  noIndex?: boolean;
  title: string;
}) {
  const fullTitle = pageTitle(title);

  return {
    meta: [
      { title: fullTitle },
      { content: fullTitle, property: "og:title" },
      { content: fullTitle, name: "twitter:title" },
      ...(description
        ? [
            { content: description, name: "description" },
            { content: description, property: "og:description" },
            { content: description, name: "twitter:description" },
          ]
        : []),
      ...(noIndex ? [{ content: "noindex, nofollow", name: "robots" }] : []),
    ] satisfies HeadMeta[],
  };
}

/**
 * Sign-in redirects (ikuzo://auth/anilist, ikuzo://auth/mal) are consumed by
 * expo-web-browser's auth session. If Android also hands one to the router,
 * show Settings, where sign-in started, instead of an unmatched route.
 */
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }): string => {
  try {
    const url = new URL(path, "ikuzo://app");
    const isAuthRedirect = url.hostname === "auth" || url.pathname.startsWith("/auth");
    return isAuthRedirect ? "/settings" : path;
  } catch {
    return "/";
  }
};

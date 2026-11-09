# How Ikuzo is built

A tour of the mobile app for someone learning Expo and TanStack DB. Each section says what the pattern is, why the app uses it, and which file to read. The app is in `apps/mobile`.

Official docs to keep open: [Expo](https://docs.expo.dev) (use the page for the SDK version in `package.json`, currently 58), [TanStack DB](https://tanstack.com/db/latest/docs/overview) and [TanStack Query](https://tanstack.com/query/latest).

## Expo

### One config file, no native folders

`app.config.ts` is the whole native setup. There is no `android/` or `ios/` folder in the repository: Expo generates them when it builds (`expo prebuild`, which CI runs). Native settings are changed with **config plugins**, the `plugins` array in that file. `plugins/with-anidb-cleartext.ts` is a small plugin written for this app; read it to see what one looks like.

Install packages with `npx expo install <name>`, not `pnpm add`: it picks the version that matches the SDK. `npx expo-doctor` checks the project for mismatches.

### Screens are files

Expo Router turns files in `src/app` into screens.

| File                      | What it is                                                              |
| ------------------------- | ----------------------------------------------------------------------- |
| `_layout.tsx`             | The root: providers and the stack every screen is pushed onto           |
| `(tabs)/_layout.tsx`      | The bottom tab bar. The brackets group files without adding to the URL  |
| `(tabs)/index.tsx`        | Home, the first tab                                                     |
| `anime/[source]/[id].tsx` | A show page. `[source]` and `[id]` are read with `useLocalSearchParams` |
| `+native-intent.tsx`      | Rewrites incoming links (the sign-in redirect) before routing           |

Everything that is not a screen lives outside `src/app`, in `src/components` and `src/lib`. `experiments.typedRoutes` in the config makes `router.push` reject paths that do not exist.

### Different code per platform

A file named `kv.web.ts` replaces `kv.ts` in the web build. The app uses this for storage (`kv`, `persistence`, `secrets`) and for the swipeable tabs (`pager-tabs`), so screens never check which platform they are on.

### Keeping the screen smooth

The app has two threads that matter. JavaScript runs your components; the UI thread draws and handles touches. Animation stutters when JavaScript is busy, unless the animation runs on the UI thread.

- **Animations use Reanimated** (`useSharedValue`, `useAnimatedStyle`, `withTiming`). They run on the UI thread. See `components/touchable.tsx` for the smallest example and `app/anime/[source]/[id].tsx` for the collapsing header. Timings are in `lib/motion.ts`.
- **Long lists use FlashList** (`components/row-list.tsx`). It reuses a screenful of rows instead of creating one per item. Because rows are reused, a row must not animate when it mounts and must reset anything it remembers about the previous item (`components/progress-bar.tsx`).
- **Screens you cannot see do not render.** `freezeOnBlur` on the stack and the tabs (`_layout.tsx` files) pauses screens underneath the current one.
- **Heavy parts wait for the transition.** `lib/use-after-transition.ts` lets the show page draw its carousels after it has finished sliding in.
- **Show something at once.** A show page draws immediately from the card that was tapped (`placeholderData` in `lib/queries.ts`) and uses grey placeholders (`components/skeleton.tsx`) for what is still loading, so the layout does not jump.
- **Images use `expo-image`** with a `recyclingKey` in lists and `cachePolicy="memory-disk"`.
- **The React Compiler is on** (`experiments.reactCompiler`). It memoizes components for you, so you rarely need `memo` or `useCallback`; the `useMemo` calls in the code are for real work such as sorting the library. One trap: inside a Reanimated worklet (`useAnimatedStyle`), do not write inline callbacks such as `array.map(() => …)`. The compiler moves them out of the worklet and the app crashes. `components/tab-strip.tsx` has the comment.
- **Safe areas.** Android draws under the status and navigation bars. Top insets are applied in `components/header.tsx`; the bottom inset once, in the root layout.

### Things Hermes does not have

Hermes, the JavaScript engine on phones, lacks a few browser features. `src/polyfills.ts` adds the two this app needs (`Array.prototype.toSorted` and Web Crypto, which TanStack DB uses for ids) and is imported first in `index.ts`. Code that works on web and crashes on a phone at launch is usually this.

## Data

Two kinds of data, two libraries.

| Data | Lives | Library | File |
| --- | --- | --- | --- |
| Your list, bookmarks, favourites, notes, settings | On the phone | TanStack DB | `lib/db.ts`, `lib/store.ts` |
| Show pages, search, schedules | On AniList / MyAnimeList | TanStack Query | `lib/queries.ts` |
| Accounts and the queue of changes to send | On the phone | zustand | `lib/accounts.ts` |

### TanStack DB: collections

A **collection** is a typed table held in memory. `lib/db.ts` creates one per kind of row, and `lib/persistence.ts` saves them to SQLite through TanStack DB's Expo adapter. They are loaded once at startup (`whenLibraryReady`), behind the splash screen.

### TanStack DB: reading

Components read with `useLiveQuery`, which re-renders them when the result changes. `lib/store.ts` wraps every read in a small hook (`useEntries`, `useEntry`, `useBookmarks`…) so screens never write queries themselves. Three rules, each visible in that file:

1. **A whole collection: pass the collection.** `useLiveQuery(entriesCollection)` subscribes to the collection itself and costs nothing to start.
2. **A query several screens need: create it once.** `createLiveQueryCollection(…)` at module level, then `useLiveQuery(thatCollection)`. Two components that each write the same query inline each get their own copy of the result and both pay to compute it.
3. **Inline queries stay narrow.** One show's entry, one show's notes. Run them once per screen and pass the result down as props (the show page does this with `entry` and `bookmarked`).

Why this matters, measured on this app with 1,250 shows: starting an inline query over the whole library took about 40 ms on a desktop, and five screens each did it. A narrow query takes about 1 ms.

### TanStack DB: writing

All writes go through the `library` object at the bottom of `lib/store.ts` (`library.save`, `library.update`, `library.remove`…). A write changes memory immediately, so the screen updates at once, and reaches the disk a moment later.

- `afterWrite` waits for the disk (`transaction.when("settled")`) before telling the sync engine, so a write that fails is never sent to your account.
- Changing many rows is one call (`collection.update([keys], …)`), so screens update once. See `applyPull` and `refreshSnapshots`.
- Several collections change together in one transaction in `lib/backup.ts` (`createTransaction`).
- Rows returned by TanStack DB carry extra `$…` fields. `stripVirtual` removes them before a row is written back or exported.
- `schemaVersion` in `lib/persistence.ts` must stay at 1; new fields are added as optional.

### TanStack Query: remote data

`lib/queries.ts` has one hook per request. Things worth copying:

- `staleTime` decides how long data is used before asking again; show pages use anYme's rule (an hour for upcoming shows, two weeks for old finished ones).
- A **persister** saves each show page to storage, so pages open offline.
- `networkMode: "offlineFirst"` shows saved data straight away.
- `shouldRetry` does not retry requests the server refused.

### Sync

`lib/sync.ts` sends your changes to AniList and MyAnimeList and pulls the account's list. The decisions (what a pull changes, what gets uploaded) are pure functions in `packages/anime/src/account-sync.ts` and `sync-queue.ts`, with unit tests beside them. Keeping them free of storage and network code is what makes them testable.

## Checks

```bash
pnpm check                      # lint and format
pnpm check-types                # TypeScript
pnpm test                       # unit tests
pnpm --filter mobile export     # bundle the app the way a release build does
cd apps/mobile && npx expo-doctor
```

CI (`.github/workflows/android-apk.yml`) runs these, builds the APK, launches it on an emulator and fails if it crashes.

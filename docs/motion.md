# Motion

Ikuzo's animations take their timing from the original anYme app. The numbers below were read from anYme's public APK (its animation resources and how its screens use them) and rebuilt from scratch with React Native Reanimated: no code or assets were copied, only the feel.

| Interaction | anYme source | Ikuzo |
| --- | --- | --- |
| Switching bottom tabs | `xfade_in`/`xfade_out`, 400 ms alpha | Tabs cross-fade over 400 ms |
| Top tabs (lists, days, anime page) | `ViewPager` + `TabLayout`, indicator 250–300 ms | Swipeable pages; the underline follows the finger |
| Anime page header | `CollapsingToolbarLayout`, parallax image, gradient scrim, `exitUntilCollapsed` | Banner scrolls at half speed and fades, title bar fades in |
| Bars sliding in | `slide_in_from_*`, 700 ms, overshoot (tension 0.8) | Update sheet and confirmation bar slide in with `Easing.out(Easing.back(0.8))` |
| Bars sliding out | `slide_out_to_bottom`, 500 ms, anticipate (tension 0.8) | Same curve: `Easing.back(0.8)` |
| Popup menus | `popup_enter`/`popup_exit`, 150 ms fade, decelerate 1.5 | Backdrops fade over 150 ms |
| Side menu | `MaterialDrawer` (DrawerLayout slide + scrim) | Slides in from the left over a fading scrim |
| Lists | `RecyclerView` default item animator: 120 ms fades, 250 ms moves | Rows fade in/out over 120 ms and slide into place over 250 ms |
| Cards and buttons | Material ripple, card press 120 ms | Native ripple plus a slight press scale |
| Favourite heart | `MaterialFavoriteButton`, 300 ms bounce | 300 ms bounce |
| Speed dial items | 150 ms in / 200 ms out, scale 0.5 to 1, rise 30 % | Not used yet |

The tokens live in `apps/mobile/src/lib/motion.ts`. Every animation is skipped when the system "Remove animations" setting is on (Reanimated's `ReduceMotion.System`).

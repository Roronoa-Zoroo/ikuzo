import { Easing } from "react-native-reanimated";

/*
 * Motion tokens, based on the original anYme app's animation resources (see docs/motion.md),
 * with the long ones shortened: at anYme's lengths the app felt slow to respond. Android's Overshoot/Anticipate interpolators with
 * tension T are exactly Reanimated's Easing.out(Easing.back(T)) / Easing.back(T).
 */
const TENSION = 0.8;

export const duration = {
  /** Favourite heart bounce (MaterialFavoriteButton default) */
  bounce: 300,
  /** Switching bottom tabs (anYme's xfade was 400 ms) */
  crossfade: 180,
  /** Images fading in once loaded */
  image: 250,
  /** List item add/remove (RecyclerView DefaultItemAnimator) */
  itemFade: 120,
  /** List item moving into place */
  itemMove: 250,
  /** Side menu and option panels */
  panel: 250,
  /** Popup menus and backdrops (popup_enter / popup_exit) */
  popup: 150,
  /** Pressed state of cards and buttons (mtrl_card_anim_duration_ms) */
  press: 120,
  /** Bottom sheets: the same overshoot curve, shortened so a sheet feels responsive */
  sheetIn: 300,
  /** Bottom sheets leaving: anticipate curve */
  sheetOut: 200,
  /** Slide-in bars (anYme's slide_in_from_bottom was 700 ms) */
  slideIn: 320,
  /** Slide-out bars (anYme's slide_out_to_bottom was 500 ms) */
  slideOut: 240,
  /** Tab underline sliding to the selected tab */
  tabIndicator: 250,
} as const;

export const easing = {
  /** slide_out: pull back a little, then leave */
  anticipate: Easing.back(TENSION),
  /** popup fades: decelerate with factor 1.5 */
  decelerate: Easing.out(Easing.poly(3)),
  /** slide_in: overshoot a little past the end, then settle */
  overshoot: Easing.out(Easing.back(TENSION)),
  /** Material standard curve for everything else */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

/** How far a pressed card shrinks: just enough to feel physical. */
export const PRESSED_SCALE = 0.97;

import { Easing } from "react-native-reanimated";

/*
 * Motion tokens, measured from the original anYme app's animation resources
 * (see docs/motion.md). Android's Overshoot/Anticipate interpolators with
 * tension T are exactly Reanimated's Easing.out(Easing.back(T)) / Easing.back(T).
 */
const TENSION = 0.8;

export const duration = {
  /** Favourite heart bounce (MaterialFavoriteButton default) */
  bounce: 300,
  /** Switching bottom tabs (xfade_in / xfade_out) */
  crossfade: 400,
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
  sheetIn: 450,
  /** Bottom sheets leaving: anticipate curve */
  sheetOut: 300,
  /** Slide-in bars and sheets (slide_in_from_bottom / _top) */
  slideIn: 700,
  /** Slide-out bars and sheets (slide_out_to_bottom) */
  slideOut: 500,
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

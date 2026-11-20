import { useSyncExternalStore } from 'react';

// Fitting the app to the screen it's on.
//
// A web app can't reliably ask which phone it's running on (iOS never says), and
// the same phone changes size anyway with Display Zoom, a bigger display size,
// split screen or a fold. So this measures the screen the app actually has, and
// does it again on every resize, rotation and fold:
//
//  - Width. Every layout is drawn for a screen at least MIN_W CSS px wide. A
//    narrower one (a Galaxy Z Fold's cover screen, an iPhone SE or mini, any
//    phone with Display Zoom or display size turned up) gets the same layout
//    scaled down to fit, through the viewport meta tag. The browser then lays the
//    page out at MIN_W, so every fixed size, canvas and touch sees a MIN_W-wide
//    screen, and nothing wraps into or slides under its neighbour.
//  - Height. App publishes the scroll area's size (usePageH), and a screen that
//    has to fit in one view sizes itself to it: the quest stage scales down to
//    keep the controls under it on screen (stageScale).
export const MIN_W = 360;
// Matches frontend.index.html, so a screen that is wide enough is left exactly as it was.
const BASE = 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover';

let state = { pageW: 0, pageH: 0, deviceW: 0, deviceH: 0, scale: 1 };
const subs = new Set();
const set = (patch) => {
  if (Object.keys(patch).every((k) => state[k] === patch[k])) return;
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

// The window's size in CSS px at 100% zoom, whatever the viewport tag says.
// visualViewport.scale undoes our own scaling (Chrome); the screen's own size in
// this orientation is the cross-check for browsers that report it differently
// (iOS's screen.width never swaps on rotation, hence the min/max).
function windowSize() {
  const vv = window.visualViewport;
  let w = vv ? vv.width * vv.scale : window.innerWidth;
  const h = vv ? vv.height * vv.scale : window.innerHeight;
  const s = window.screen;
  if (s?.width > 0 && s?.height > 0) w = Math.min(w, h >= w ? Math.min(s.width, s.height) : Math.max(s.width, s.height));
  return [w, h];
}

let applied = 1, lastKey = '', lastAt = 0, bounces = 0;
function fitWidth() {
  const meta = document.querySelector('meta[name="viewport"]');
  const [w, h] = windowSize();
  // Rounded down, so the page always lays out at MIN_W or a hair wider.
  const scale = w > 0 && w < MIN_W - 0.5 ? Math.floor((w / MIN_W) * 1000) / 1000 : 1;
  if (meta && scale !== applied) {
    // A browser that measured itself differently once scaled would bounce
    // between the two settings forever. A bounce is a flip with the screen
    // itself unchanged (same size and orientation), right after the last one;
    // a real fold, rotation or resize never counts. After two, stay scaled:
    // a little small beats clipped.
    const now = Date.now(), key = `${window.screen?.width}x${window.screen?.height}:${h >= w ? 'p' : 'l'}`;
    bounces = key === lastKey && now - lastAt < 2000 ? bounces + 1 : 0;
    if (!(scale === 1 && bounces >= 2)) {
      meta.setAttribute('content', scale < 1
        ? `width=${MIN_W}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no, viewport-fit=cover`
        : BASE);
      applied = scale;
      lastKey = key;
      lastAt = now;
    }
  }
  set({ deviceW: Math.round(w), deviceH: Math.round(h), scale: applied });
}

if (typeof window !== 'undefined') {
  // Runs on import, before the first render, so nothing is ever laid out at the wrong width.
  fitWidth();
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitWidth); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);
  window.screen?.orientation?.addEventListener?.('change', later);
}

/** Publishes `el`'s size as the page box (App's scroll area). Returns the cleanup. */
export function observePage(el) {
  if (!el || typeof ResizeObserver === 'undefined') return () => {};
  const read = () => set({ pageW: el.clientWidth, pageH: el.clientHeight });
  const ro = new ResizeObserver(read);
  ro.observe(el);
  read();
  return () => ro.disconnect();
}

/** Height of the page's scroll area (between the header and the nav), in CSS px. */
export const usePageH = () => useSyncExternalStore(subscribe, () => state.pageH);
/** { deviceW, deviceH, scale, pageW, pageH }: the screen as measured, and the width scale in force. */
export const useScreenFit = () => useSyncExternalStore(subscribe, () => state);

// The quest stage is drawn 340 tall. On a short screen it scales down as one
// piece (QuestStage `scale`), its text panels by √k so they stay readable,
// never below STAGE_MIN_K: under that the sprites get too small to enjoy and
// the page scrolls instead. Down to STAGE_EASY_K it looks just as it was drawn.
export const STAGE_H = 340;
export const STAGE_EASY_K = 0.8;
export const STAGE_MIN_K = 0.58;
// The title screen's hero card: 161 px (5:7, 226 tall) on a phone, narrower on a
// narrow stage so the GAINS QUEST title beside it keeps its room.
export const MINI_CARD_W = 'min(161px, 44%)';
const kOf = (h) => Math.floor((h / STAGE_H) * 100) / 100;

/** Stage scale for `room` px of height (null = not measured yet: full size). */
export const stageScale = (room, floor = STAGE_EASY_K) => (room == null || !Number.isFinite(room) ? 1
  : Math.min(1, Math.max(floor, kOf(room))));

// Wide enough to put a quest battle's stage and card side by side (fold inner
// screens, tablets, 4:3): there the two columns fit a short screen without
// shrinking anything, where one column would have to.
export const TWO_COL_W = 640;

// Desktop planner threshold: above phone portrait/landscape widths (<=956px)
// and foldables (<=884px), matching mobile "Desktop site" (~980px), landscape
// tablets, and desktop/laptop windows.
export const DESK_W = 980;
const DESK_KEY = 'gains-beta-desk';
const deskSubs = new Set();
const notifyDesk = () => deskSubs.forEach((f) => f());

function readDeskPref() {
  try {
    const v = localStorage.getItem(DESK_KEY);
    return v === 'desk' || v === 'phone' ? v : null;
  } catch {
    return null;
  }
}

const deskMql = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia(`(min-width: ${DESK_W}px)`)
  : null;
if (deskMql) {
  if (deskMql.addEventListener) deskMql.addEventListener('change', notifyDesk);
  else deskMql.addListener?.(notifyDesk);
}

export function isDeskViewport() {
  return deskMql ? deskMql.matches : (typeof window !== 'undefined' && window.innerWidth >= DESK_W);
}

export function getDeskLayout() {
  const pref = readDeskPref();
  if (pref === 'desk') return true;
  if (pref === 'phone') return false;
  return isDeskViewport();
}

export function toggleDeskLayout(wantDesk) {
  const want = !!wantDesk;
  try {
    if (want === isDeskViewport()) localStorage.removeItem(DESK_KEY);
    else localStorage.setItem(DESK_KEY, want ? 'desk' : 'phone');
  } catch { /* private mode */ }
  notifyDesk();
}

export const useDeskLayout = () => useSyncExternalStore(
  (f) => { deskSubs.add(f); return () => deskSubs.delete(f); },
  getDeskLayout,
);

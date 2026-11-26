import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { CARDS, warmCard } from '../lib/dither';
import { favCardId } from '../lib/quest';
import { effCard } from '../components/DitherCard';

// Forge art per vault slot { name, style, pal, img }, loaded once per session
// and shared by every component that shows a card.
let art = null, loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(art));
const load = () => (loading ??= api.getQuestArt().then((r) => { art = r.art || {}; emit(); return art; }).catch(() => { art = {}; emit(); return art; }));

export const warmQuestArt = () => load();
export const isQuestArtReady = () => art !== null;
export const getCachedQuestArt = () => art || {};

export async function saveArt(slot, rec) {
  await api.saveQuestArt(slot, rec);
  art = { ...(art || {}), [slot]: rec }; emit();
}
export async function resetArt(slot) {
  await api.deleteQuestArt(slot);
  art = { ...(art || {}) }; delete art[slot]; emit();
}

export default function useQuestArt() {
  const [a, setA] = useState(art);
  useEffect(() => { subs.add(setA); load(); return () => subs.delete(setA); }, []);
  return a || {};
}

/**
 * Fetch the art and prepare the cards the quest title opens on (the hero card,
 * then each favourite's) at idle, from whatever screen you're on, so they're
 * cached before you get there. One card per idle slot, so the screen you're
 * looking at doesn't hitch. Returns a stop function.
 */
export function warmQuestCards(prof, vault) {
  let live = true, id = 0;
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 32));
  load().then(() => {
    if (!live) return;
    const hero = (vault.favs || []).find((c) => vault.owned?.[c] && CARDS[c - 1]);
    // The same picks the fan makes (favCardId), by position among the saved favourites.
    const ids = [hero, ...(prof.favs || []).map((f, i) => favCardId(f, i, vault))].filter((c, i, a) => c && CARDS[c - 1] && a.indexOf(c) === i);
    const pump = () => {
      const c = live && ids.length && CARDS[ids.shift() - 1];
      if (!c) return;
      // Same arguments as DitherCard, so it finds this pre-rendered in stillCache.
      warmCard(effCard(c, art[c.id]), art[c.id]?.img).catch(() => {}).then(() => { if (live) id = idle(pump); });
    };
    id = idle(pump);
  });
  return () => { live = false; if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); else clearTimeout(id); };
}

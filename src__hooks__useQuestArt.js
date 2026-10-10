import { useEffect, useState } from 'react';
import * as api from '../lib/api';

// Forge art per vault slot { name, style, pal, img }, loaded once per session
// and shared by every component that shows a card.
let art = null, loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(art));
const load = () => (loading ??= api.getQuestArt().then((r) => { art = r.art || {}; emit(); }).catch(() => { art = {}; emit(); }));

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

import { useCallback } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { withDefaults, TINTS } from '../lib/quest';

// Scene look is an appearance setting (localStorage, synced by AppearanceSync);
// progress (profile, vault) lives in the account via saveQuest.
export const QUEST_TINT_KEY = 'gains-cmd-quest-tint';
export const QUEST_SCAN_KEY = 'gains-cmd-quest-scanlines';
export const readTint = () => { try { const v = localStorage.getItem(QUEST_TINT_KEY); return TINTS[v] ? v : 'amber'; } catch { return 'amber'; } };
export const readScanlines = () => { try { return localStorage.getItem(QUEST_SCAN_KEY) !== 'off'; } catch { return true; } };

// The handoff's starter vault: five commons/rares and one starred favourite.
export const VAULT_START = { owned: { 1: 1, 2: 1, 7: 1, 32: 1, 41: 1 }, favs: [32] };

export default function useQuest() {
  const { settings, saveQuest } = useWorkout();
  const q = settings?.quest || {};
  const prof = withDefaults(q.profile);
  const vault = q.vault?.owned ? q.vault : VAULT_START;
  const updProf = useCallback((fn) => saveQuest((cur) => ({ ...cur, profile: fn(withDefaults(cur.profile)) })), [saveQuest]);
  const updVault = useCallback((fn) => saveQuest((cur) => ({ ...cur, vault: fn(cur.vault?.owned ? cur.vault : VAULT_START) })), [saveQuest]);
  return { prof, vault, updProf, updVault, ready: !!settings };
}

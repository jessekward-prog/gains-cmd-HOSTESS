import { useCallback } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { withDefaults, TINTS } from '../lib/quest';

// Scene look is an appearance setting (localStorage, synced by AppearanceSync);
// progress (profile, vault) lives in the account via saveQuest.
export const QUEST_TINT_KEY = 'gains-beta-quest-tint';
export const QUEST_SCAN_KEY = 'gains-beta-quest-scanlines';
export const readTint = () => { try { const v = localStorage.getItem(QUEST_TINT_KEY); return TINTS[v] ? v : 'amber'; } catch { return 'amber'; } };
export const QUEST_SCROLL_KEY = 'gains-beta-quest-scrolls';
export const readScrolls = () => { try { return localStorage.getItem(QUEST_SCROLL_KEY) !== 'off'; } catch { return true; } };
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

// Quest animations, each switchable in Settings → Quest → Animations (on by default, except FX_OFF).
export const QUEST_FX = [
  ['charge', 'Charged specials', 'Timed sets (and casters) build a charge; Attack releases a special: sword beam, charged arrow or big orb'],
  ['ring', 'Rune circle', 'A glowing ring under the hero as the spell charges'],
  ['camp', 'Camp at rest', 'The hero crouches, the pet wanders off, the hero stands for the last 3 s'],
  ['react', 'Monster reactions', 'Flinches when you add weight, laughs when you drop it'],
  ['last', 'Last stand', 'The final set of an exercise: red aura and stomps'],
  ['pr', 'Record hits', 'A gold NEW RECORD strike on a PR'],
  ['tag', 'Tag-team', 'Your pet attacks on superset partner B'],
  ['chain', 'Drop combos', 'One strike per set in a drop chain'],
  ['gauntlet', 'Cardio gauntlet', 'During cardio the hero runs a gauntlet of small monsters; on interval rests they stop to breathe'],
  ['weather', 'Location effects', 'Petals in the meadow, needles in the pines, snow on the ridge, mist in the dark wood, drips in the dungeon'],
  ['ambient', 'Ambient life', 'Breathing, birds and a few faint dust motes'],
  ['daynight', 'Day and night', 'The sky darkens as the session goes on'],
  ['loot', 'Loot pickup', 'A gem drops and your pet fetches it'],
  ['combo', 'Combo meter', 'Sets started on time build a combo and a little bonus XP'],
  ['doze', 'Dozing monster', 'Wait too long and it falls asleep: sneak attack'],
];
export const questFxKey = (id) => `gains-beta-qfx-${id}`;
const FX_OFF = ['ring'];
export const readQuestFx = () => Object.fromEntries(QUEST_FX.map(([id]) => {
  const dflt = !FX_OFF.includes(id);
  try { const v = localStorage.getItem(questFxKey(id)); return [id, v ? v === 'on' : dflt]; } catch { return [id, dflt]; }
}));

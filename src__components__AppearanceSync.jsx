import { useEffect } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import * as api from '../lib/api';
import { QUEST_FX, questFxKey } from '../hooks/useQuest';

// Theme, font, layout etc. live in localStorage (instant first paint, read by
// ThemeContext at mount). This copies them to the account so they follow you
// to other devices: newer-on-server → write locally and reload once;
// changed locally → push.
const KEYS = [
  'gains-beta-theme', 'gains-beta-accent', 'gains-beta-intensity', 'gains-beta-font', 'gains-beta-text-size',
  'gains-beta-banner-enabled', 'gains-beta-banner-text', 'gains-beta-scale-px', 'gains-beta-workout-layout', 'gains-beta-expand-mode',
  'gains-beta-waves', 'gains-beta-greeting', 'gains-beta-quest-tint', 'gains-beta-quest-scanlines', 'gains-beta-quest-scrolls',
  'gains-beta-crt', 'gains-beta-vignette', 'gains-beta-roll', 'gains-beta-quest-theme', 'gains-beta-quest-crt', 'gains-beta-quest-roll',
  'gains-beta-quest-accent', 'gains-beta-quest-intensity',
  ...QUEST_FX.map(([id]) => questFxKey(id)),
];
const AT_KEY = 'gains-beta-appearance-at';

function snapshot() {
  const values = {};
  KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) values[k] = v; });
  return values;
}

export default function AppearanceSync() {
  const { settings } = useWorkout();
  const server = settings?.appearanceBeta;
  const settingsLoaded = !!settings;

  useEffect(() => {
    if (!settingsLoaded) return;
    let last;
    try {
      const localAt = parseInt(localStorage.getItem(AT_KEY)) || 0;
      if (server?.at > localAt) {
        KEYS.forEach((k) => (k in server.values ? localStorage.setItem(k, server.values[k]) : localStorage.removeItem(k)));
        localStorage.setItem(AT_KEY, String(server.at));
        window.location.reload();
        return;
      }
      last = JSON.stringify(snapshot());
      if (!server || last !== JSON.stringify(server.values)) push(JSON.parse(last));
    } catch { return; }

    // ponytail: polls a dozen localStorage keys every 3s rather than threading
    // a callback through every setter in ThemeContext/SettingsPage.
    const id = setInterval(() => {
      try {
        const now = JSON.stringify(snapshot());
        if (now !== last) { last = now; push(JSON.parse(now)); }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [settingsLoaded]);

  return null;
}

function push(values) {
  const at = Date.now();
  try { localStorage.setItem(AT_KEY, String(at)); } catch {}
  api.saveAppearance({ at, values }).catch(() => {});
}

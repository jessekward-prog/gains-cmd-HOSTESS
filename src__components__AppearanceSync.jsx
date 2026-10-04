import { useEffect } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import * as api from '../lib/api';

// Theme, font, layout etc. live in localStorage (instant first paint, read by
// ThemeContext at mount). This copies them to the account so they follow you
// to other devices: newer-on-server → write locally and reload once;
// changed locally → push.
const KEYS = [
  'gains-cmd-theme', 'gains-cmd-accent', 'gains-cmd-intensity', 'gains-cmd-font', 'gains-cmd-text-size',
  'gains-cmd-banner-enabled', 'gains-cmd-banner-text', 'gains-cmd-scale-px', 'gains-cmd-workout-layout', 'gains-cmd-expand-mode',
];
const AT_KEY = 'gains-cmd-appearance-at';

function snapshot() {
  const values = {};
  KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) values[k] = v; });
  return values;
}

export default function AppearanceSync() {
  const { settings } = useWorkout();
  const server = settings?.appearance;
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

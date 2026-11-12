// Which areas use the new canvas ground.
//
// ENABLED is a build-time constant on purpose: not quest config (a mid-session
// flip is untested) and not localStorage (that leaks between users of a device
// and survives a rollback). Flipping an area is a one-line commit and a deploy.

import calibration from './areas/calibration';
import forest from './areas/forest';
import ridge from './areas/ridge';
import darkwood from './areas/darkwood';
import dungeon from './areas/dungeon';
import meadow from './areas/meadow';

const KEY = 'quest.ground';

// ?ground=calib | off | ridge,forest   ·   ?ground=clear to forget it.
// Persisted so it survives the reloads that testing on a phone involves.
export function groundOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('ground');
    if (q === 'clear') { localStorage.removeItem(KEY); return null; }
    if (q) { localStorage.setItem(KEY, q); return q; }
    return localStorage.getItem(KEY);
  } catch { return null; }
}

// Index matches LANDS: meadow, forest, ridge, darkwood, dungeon.
export const GROUNDS = { fantasy: [meadow, forest, ridge, darkwood, dungeon] };

// The restaging IS applied (QuestStage gHX/gHY/gMX/gMY), so the actors stand
// where this camera expects them.
export const ENABLED = { meadow: true, forest: true, ridge: true, darkwood: true, dungeon: true };

// null means "render exactly what renders today". Unported, disabled, gauntlet,
// wrong theme and bake-not-ready all resolve to that same path.
export function getGround(theme, areaIdx) {
  const dev = groundOverride();
  if (dev === 'off') return null;
  if (dev === 'calib') return calibration;
  const g = GROUNDS[theme]?.[areaIdx] ?? null;
  if (!g) return null;
  return ENABLED[g.id] || (dev && dev.split(',').includes(g.id)) ? g : null;
}

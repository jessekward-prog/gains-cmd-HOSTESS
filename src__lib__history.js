// Level Up and Snooze checkpoints are stored as workout_history rows, but they
// are not training sessions — never count or list them as workouts.
export const isMarker = (w) =>
  w?.program_name === 'LEVEL_UP_MILESTONE' || w?.program_name === 'SNOOZE_MILESTONE';

// Older programs/history store weights like "16kg", which a number input
// silently renders as empty. Keep just the number.
export function cleanWeight(w) {
  const n = parseFloat(w);
  return isNaN(n) ? '' : String(n);
}

// YYYY-MM-DD in the user's own timezone. toISOString() is UTC, which is still
// "yesterday" before 10am in AEST.
export function localDate(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

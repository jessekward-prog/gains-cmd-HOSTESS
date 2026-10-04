// "8-12 reps · 1m 10s rest", or "40s on / 30s off · ..." for interval exercises
// (which have no rep target).
export function targetLabel(ex) {
  const rest = `${Math.floor(ex.restSeconds / 60)}m${ex.restSeconds % 60 > 0 ? ` ${ex.restSeconds % 60}s` : ''} rest`;
  if (ex.isInterval) return `${ex.intervalWork || 30}s on / ${ex.intervalRest || 30}s off · ${rest}`;
  return `${ex.targetReps} reps · ${rest}`;
}

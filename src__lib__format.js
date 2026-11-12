// "8-12 reps · 1m 10s rest", or "40s on / 30s off · ..." for interval exercises
// (which have no rep target).
export function targetLabel(ex) {
  const rest = `${Math.floor(ex.restSeconds / 60)}m${ex.restSeconds % 60 > 0 ? ` ${ex.restSeconds % 60}s` : ''} rest`;
  if (ex.isInterval) return `${ex.intervalWork || 30}s on / ${ex.intervalRest || 30}s off · ${rest}`;
  const timed = ex.timedSec || ex.sets?.find?.((s) => s.type === 'timed')?.timedSec;
  if (timed) return `${timed >= 60 ? `${Math.floor(timed / 60)}m${timed % 60 ? ` ${timed % 60}s` : ''}` : `${timed}s`} per set · ${rest}`;
  return `${ex.targetReps} reps · ${rest}`;
}

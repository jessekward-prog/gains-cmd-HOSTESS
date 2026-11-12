// Bake scheduler. A renderer's bake() is a generator that yields every ~1ms of
// work, so a 150-300ms bake never blocks a frame. Bakes run during walk; a battle
// whose bake isn't ready simply uses the old ground for its whole duration.

const jobs = new Map();

export const keyOf = (theme, id, boss) => `${theme}:${id}:${boss ? 'boss' : 'mon'}`;

const idle = (fn) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 500 })
    : setTimeout(() => fn({ timeRemaining: () => 8 }), 16); // Safari has no rIC

export function requestGround(theme, renderer, boss) {
  const key = keyOf(theme, renderer.id, boss);
  if (jobs.has(key)) return key; // idempotent
  const job = { it: renderer.bake({ boss }), baked: null, chunks: 0, t0: performance.now() };
  jobs.set(key, job);

  const pump = (deadline) => {
    const start = performance.now();
    do {
      const r = job.it.next();
      job.chunks++;
      if (r.done) {
        job.baked = r.value;
        console.debug('[ground]', key, 'baked in', Math.round(performance.now() - job.t0), 'ms over', job.chunks, 'chunks');
        return;
      }
    } while (deadline.timeRemaining() >= 2 && performance.now() - start < 6);
    idle(pump);
  };
  idle(pump);
  return key;
}

export const peekGround = (key) => jobs.get(key)?.baked || null;

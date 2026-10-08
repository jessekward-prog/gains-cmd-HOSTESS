import paths from '../lib/body-paths.json';

// Front + back body (MuscleMap outlines, MIT — see THIRD_PARTY.md). `heat` is
// { region: value }; a region is full accent at `full` and fades below it.
export default function BodyMap({ heat = {}, full = 1, height = 220 }) {
  return (
    <div className="flex justify-center gap-1" style={{ height }} aria-hidden="true">
      {['front', 'back'].map((side) => (
        <svg key={side} viewBox={paths.viewBox[side]} className="h-full w-auto">
          {Object.entries(paths[side]).map(([region, d]) => {
            const v = heat[region] > 0 ? Math.min(1, heat[region] / full) : 0;
            return (
              <path key={region} d={d} stroke="var(--color-bg-1)" strokeWidth="4"
                fill={region === '_body' ? 'var(--color-bg-3)' : v ? 'var(--color-accent)' : 'var(--color-bg-4)'}
                fillOpacity={v ? 0.25 + 0.75 * v : 1} />
            );
          })}
        </svg>
      ))}
    </div>
  );
}

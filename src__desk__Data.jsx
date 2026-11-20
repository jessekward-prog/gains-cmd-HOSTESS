// Desk → Data: progress per exercise (top working weight and estimated 1-rep
// max, volume per session), training frequency, and your best sets.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { isMarker } from '../lib/history';
import { MONO, PageHead, Panel, Sel, exsOf, day, fmt } from './ui';

const C1 = '#3987e5', C2 = '#d95926';
const e1rm = (w, r) => (r > 0 && w > 0 ? w * (1 + r / 30) : 0);

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function ticks(lo, hi, n = 4) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}

/** Lines over dates on one kg axis, with a hover crosshair. */
function LineChart({ points, series, height = 260, unit = 'kg' }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  if (!points.length) return <div ref={ref} className="text-text-tertiary text-sm py-10 text-center">Nothing logged yet.</div>;
  const L = 48, R = 16, T = 12, B = 26, H = height;
  const t0 = +new Date(points[0].x), t1 = +new Date(points.at(-1).x) || t0 + 1;
  const all = points.flatMap((p) => series.map((s) => p[s.key]).filter((v) => v > 0));
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.12 || 5; lo = Math.max(0, lo - pad); hi += pad;
  const X = (d) => L + ((+new Date(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const yt = ticks(lo, hi);
  const months = []; { const d = new Date(t0); d.setDate(1); while (+d <= t1) { if (+d >= t0) months.push(new Date(d)); d.setMonth(d.getMonth() + 1); } }
  const step = Math.ceil(months.length / Math.max(1, Math.floor((W - L - R) / 70)));
  const onMove = (e) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0; points.forEach((p, i) => { if (Math.abs(X(p.x) - x) < Math.abs(X(points[best].x) - x)) best = i; });
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.name).join(' and ') + ' over time'}>
        {yt.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--color-border)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">{fmt(v)}</text></g>)}
        {months.filter((_, i) => i % step === 0).map((m) => <text key={+m} x={X(m)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">{m.toLocaleString(undefined, { month: 'short' })}</text>)}
        {series.map((s) => {
          const pts = points.filter((p) => p[s.key] > 0);
          return <g key={s.key}>
            <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p[s.key])}`).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.length <= 40 && pts.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p[s.key])} r="3" fill={s.color} stroke="var(--color-bg-1)" strokeWidth="1.5" />)}
          </g>;
        })}
        {hp && <line x1={X(hp.x)} x2={X(hp.x)} y1={T} y2={H - B} stroke="var(--color-text-tertiary)" strokeDasharray="2 3" />}
        {hp && series.map((s) => hp[s.key] > 0 && <circle key={s.key} cx={X(hp.x)} cy={Y(hp[s.key])} r="5" fill={s.color} stroke="var(--color-bg-1)" strokeWidth="2" />)}
      </svg>
      {hp && (
        <div className="absolute pointer-events-none bg-bg-3 border border-border-strong rounded-lg px-3 py-2 text-xs whitespace-nowrap"
          style={{ left: Math.min(Math.max(X(hp.x), 90), W - 90), top: 4, transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)' }}>
          <div className="text-text-tertiary">{day(hp.x)}{hp.label ? ` · ${hp.label}` : ''}</div>
          {series.map((s) => hp[s.key] > 0 && <div key={s.key} className="flex items-center gap-2"><i style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: 'inline-block' }} />{s.name} {fmt(hp[s.key])} {unit}</div>)}
        </div>
      )}
    </div>
  );
}

/** Simple bars, one series, with hover. */
function Bars({ items, height = 160, color = C1, unit = '' }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  if (!items.length) return <div ref={ref} />;
  const L = 48, R = 8, T = 10, B = 24, H = height;
  const max = Math.max(...items.map((d) => d.v), 1);
  const yt = ticks(0, max, 3);
  const bw = (W - L - R) / items.length;
  const Y = (v) => T + (1 - v / (yt.at(-1) || max)) * (H - T - B);
  const every = Math.ceil(items.length / Math.max(1, Math.floor((W - L - R) / 56)));
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} onMouseLeave={() => setHover(null)} role="img" aria-label="Bar chart">
        {yt.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--color-border)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">{v >= 1000 ? `${fmt(v / 1000)}k` : fmt(v)}</text></g>)}
        {items.map((d, i) => {
          const x = L + i * bw + Math.min(2, bw * 0.15), w = Math.max(1, bw - Math.min(4, bw * 0.3)), y = Y(d.v);
          return <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
            {d.v > 0 && <path d={`M${x},${H - B} V${y + 3} q0,-3 3,-3 H${x + w - 3} q3,0 3,3 V${H - B} Z`} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
            {i % every === 0 && <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">{d.tick}</text>}
          </g>;
        })}
      </svg>
      {hover != null && <div className="absolute pointer-events-none bg-bg-3 border border-border-strong rounded-lg px-3 py-1.5 text-xs whitespace-nowrap"
        style={{ left: Math.min(Math.max(L + hover * bw + bw / 2, 70), W - 70), top: 0, transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)' }}>
        <span className="text-text-tertiary">{items[hover].label}</span> · {fmt(items[hover].v)}{unit}</div>}
    </div>
  );
}

export default function DeskData() {
  const { workoutHistory } = useWorkout();
  const sessions = useMemo(() => (workoutHistory || []).filter((h) => !isMarker(h)).map((h) => ({ date: day(h.date), name: h.workout_name, exs: exsOf(h) })).reverse(), [workoutHistory]);

  // Per exercise: one point per session from its counted working sets.
  const byEx = useMemo(() => {
    const m = new Map();
    for (const s of sessions) for (const e of s.exs) {
      if (e.type === 'cardio' || e.boss) continue;
      const sets = (e.sets || []).filter((x) => x.completed && x.type !== 'drop').map((x) => ({ w: +x.weight || 0, r: parseInt(x.reps, 10) || 0 })).filter((x) => x.w > 0 && x.r > 0);
      if (!sets.length) continue;
      const top = sets.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
      const best1 = sets.reduce((a, b) => (e1rm(b.w, b.r) > e1rm(a.w, a.r) ? b : a));
      const p = { x: s.date, top: top.w, e1rm: Math.round(e1rm(best1.w, best1.r) * 10) / 10, vol: sets.reduce((a, b) => a + b.w * b.r, 0), label: `${fmt(top.w)} × ${top.r}`, best: best1 };
      if (!m.has(e.name)) m.set(e.name, []);
      m.get(e.name).push(p);
    }
    return m;
  }, [sessions]);
  const names = useMemo(() => [...byEx.keys()].sort((a, b) => byEx.get(b).length - byEx.get(a).length || a.localeCompare(b)), [byEx]);
  const [name, setName] = useState(null);
  const cur = name && byEx.has(name) ? name : names[0];
  const pts = byEx.get(cur) || [];
  const bestSet = pts.reduce((a, p) => (!a || e1rm(p.best.w, p.best.r) > e1rm(a.w, a.r) ? p.best : a), null);

  // Sessions per week, last 26 weeks.
  const weeks = useMemo(() => {
    const now = new Date(); const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 26 }, (_, k) => {
      const start = new Date(monday); start.setDate(start.getDate() - (25 - k) * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const n = sessions.filter((s) => { const d = new Date(s.date); return d >= start && d < end; });
      return { v: n.length, vol: n.reduce((a, s) => a + s.exs.reduce((b, e) => b + (e.sets || []).reduce((c, x) => c + (x.completed && +x.weight > 0 && +x.reps > 0 ? +x.weight * +x.reps : 0), 0), 0), 0), label: `Week of ${day(start.toISOString())}`, tick: start.toLocaleString(undefined, { day: 'numeric', month: 'short' }) };
    });
  }, [sessions]);

  const prs = names.map((n) => {
    const p = byEx.get(n);
    const b = p.reduce((a, x) => (e1rm(x.best.w, x.best.r) > e1rm(a.best.w, a.best.r) ? x : a));
    return { n, sessions: p.length, best: b.best, est: e1rm(b.best.w, b.best.r), date: b.x, last: p.at(-1).x, first: p[0].top, now: p.at(-1).top };
  });

  return (
    <div className="pb-16">
      <PageHead eyebrow="DATA" title="Progress"
        right={<Sel value={cur || ''} onChange={(e) => setName(e.target.value)} className="min-w-[260px]">{names.map((n) => <option key={n} value={n}>{n} · {byEx.get(n).length} sessions</option>)}</Sel>}>
        How each exercise is moving, how often you train, and your best sets. Estimated 1-rep max uses weight × (1 + reps ÷ 30).
      </PageHead>
      <div className="px-8 pt-6 grid gap-6">
        {cur && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {[['Sessions', pts.length], ['Top weight now', `${fmt(pts.at(-1)?.top)} kg`], ['Change', pts.length > 1 ? `${pts.at(-1).top - pts[0].top >= 0 ? '+' : ''}${fmt(pts.at(-1).top - pts[0].top)} kg` : '—'], ['Best set', bestSet ? `${fmt(bestSet.w)} × ${bestSet.r}` : '—']].map(([k, v]) => (
              <div key={k} className="rounded-[18px] bg-bg-1 border border-border px-4 py-3">
                <div className="text-text-tertiary" style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em' }}>{k.toUpperCase()}</div>
                <div className="font-extrabold text-[24px] mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
          <Panel title={cur || 'No exercises yet'} note="top working weight and estimated 1-rep max"
            right={<span className="flex gap-4 text-xs text-text-secondary">{[['Top weight', C1], ['Est. 1RM', C2]].map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i style={{ width: 12, height: 2, background: c, display: 'inline-block' }} />{l}</span>)}</span>}>
            <LineChart points={pts} series={[{ key: 'top', name: 'Top weight', color: C1 }, { key: 'e1rm', name: 'Est. 1RM', color: C2 }]} />
          </Panel>
          <Panel title="Volume per session" note="weight × reps, working sets">
            <Bars items={pts.map((p) => ({ v: Math.round(p.vol), label: p.x, tick: p.x.slice(5) }))} height={260} unit=" kg" />
          </Panel>
        </div>
        <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <Panel title="Sessions per week" note="last 26 weeks"><Bars items={weeks} unit=" sessions" /></Panel>
          <Panel title="Volume per week" note="kg lifted, last 26 weeks"><Bars items={weeks.map((w) => ({ ...w, v: Math.round(w.vol) }))} color={C2} unit=" kg" /></Panel>
        </div>
        <Panel title="Best sets" note="per exercise, by estimated 1-rep max" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr className="text-text-tertiary text-left" style={{ font: `500 10px ${MONO}`, letterSpacing: '.08em' }}>
                <th className="px-4 py-2 font-medium">EXERCISE</th><th className="px-2 py-2 font-medium text-right">SESSIONS</th><th className="px-2 py-2 font-medium text-right">BEST SET</th>
                <th className="px-2 py-2 font-medium text-right">EST. 1RM</th><th className="px-2 py-2 font-medium text-right">TOP WEIGHT</th><th className="px-4 py-2 font-medium text-right">LAST DONE</th>
              </tr></thead>
              <tbody>{prs.map((r) => (
                <tr key={r.n} onClick={() => setName(r.n)} className={`border-t border-border cursor-pointer hover:bg-bg-2 ${r.n === cur ? 'bg-bg-3' : ''}`}>
                  <td className="px-4 py-2">{r.n}</td><td className="px-2 py-2 text-right text-text-secondary">{r.sessions}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.best.w)} × {r.best.r} <span className="text-text-tertiary text-xs">{r.date.slice(5)}</span></td>
                  <td className="px-2 py-2 text-right font-bold">{fmt(Math.round(r.est))} kg</td>
                  <td className="px-2 py-2 text-right text-text-secondary">{fmt(r.first)} → {fmt(r.now)}</td>
                  <td className="px-4 py-2 text-right text-text-secondary">{r.last}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

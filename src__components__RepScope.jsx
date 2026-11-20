import { useEffect, useRef } from 'react';
import { useRepSensorCtx } from '../context/RepSensorContext';

// Ten seconds of sensor motion under the battle scene. Deliberately not a rep
// count: there is no tuned counter yet, and a number on screen would be a guess.
// What this answers is the only question an alpha session needs answered live —
// is the sensor still feeding, and is this set being recorded.
//
// Connected: a red record dot and the live trace, and the dot switches
// recording off and on (REC ⇄ LIVE). Not connected (dropped, or the page was
// reloaded): a grey dot and a grey square wave, and the dot is the reconnect
// button — a Bluetooth connection can only start from a tap.
const SPAN_MS = 10_000;
const STRIP_CSS = '@keyframes rep-rec-blink{0%,60%{opacity:1}61%,100%{opacity:.25}}.rep-rec-dot{animation:rep-rec-blink 1.2s steps(1) infinite}@media (prefers-reduced-motion:reduce){.rep-rec-dot{animation:none}}';
const SQUARE_PX = 14; // half-period of the "no signal" wave

// The rep tracker is in play for this quest: either armed, or linked and ready
// to be armed. Nothing about it is drawn otherwise.
export const repTracking = (ctx) => !!ctx && (!!ctx.alpha || !!ctx.inPlay || ctx.sensor?.status === 'linked');

export default function RepScope() {
  const ctx = useRepSensorCtx();
  const cv = useRef(null);
  const pts = useRef([]);
  const status = ctx?.sensor?.status;
  const linked = status === 'linked';
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  // Grey means "not being saved", whether the link is gone or recording is off,
  // so the trace can't look live while nothing is kept.
  const recRef = useRef(false);
  recRef.current = linked && !!ctx?.alpha;
  // Guided counting paints the signal the counter actually decides on, not the
  // generic motion trace — the point of watching it is to see whether the reps
  // it marks are the reps you did.
  const peekRef = useRef(null);
  const countingRef = useRef(false);
  peekRef.current = ctx?.peek || null;
  countingRef.current = !!(linked && ctx?.alpha && ctx?.guided && ctx?.phase === 'counting');

  useEffect(() => {
    if (!ctx?.subscribe) return undefined;
    let raf = 0;

    const draw = () => {
      raf = 0;
      const c = cv.current;
      if (!c) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const css = getComputedStyle(c);
      const on = linkedRef.current;
      // Follow the active skin rather than hardcoding a colour.
      const col = recRef.current
        ? css.getPropertyValue('--color-accent').trim() || '#f5a623'
        : css.getPropertyValue('--color-text-tertiary').trim() || '#666';
      const mid = Math.round(h / 2) + 0.5;
      const amp = h / 2 - 1;

      g.strokeStyle = col;
      g.lineWidth = 1;
      g.globalAlpha = 0.16;
      g.beginPath();
      g.moveTo(0, mid);
      g.lineTo(w, mid);
      g.stroke();
      g.globalAlpha = 1;

      g.beginPath();
      if (on) {
        const t0 = Date.now() - SPAN_MS;
        let started = false;
        for (const [t, v] of pts.current) {
          if (t < t0) continue;
          const x = ((t - t0) / SPAN_MS) * w;
          const y = mid - Math.max(-1, Math.min(1, v)) * amp;
          if (started) g.lineTo(x, y);
          else { g.moveTo(x, y); started = true; }
        }
        g.lineWidth = 1.25;
        g.shadowColor = col;
        g.shadowBlur = 4;
      } else {
        // Scrolls slowly so it reads as "waiting", not as a frozen frame.
        const off = (Date.now() / 60) % (SQUARE_PX * 2);
        const hi = mid - amp * 0.55;
        const lo = mid + amp * 0.55;
        let x = -off;
        let up = true;
        g.moveTo(x, hi);
        while (x < w) {
          const y = up ? hi : lo;
          g.lineTo(x + SQUARE_PX, y);
          up = !up;
          g.lineTo(x + SQUARE_PX, up ? hi : lo);
          x += SQUARE_PX;
        }
        g.lineWidth = 1.25;
        g.shadowBlur = 0;
      }
      g.stroke();

      // A tick where each rep was counted. If these do not line up with the
      // reps you felt, the counter is wrong — which is the whole reason to look.
      const pk = countingRef.current ? peekRef.current?.() : null;
      if (pk?.marks?.length) {
        const t0 = Date.now() - SPAN_MS;
        g.shadowBlur = 0;
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        for (const m of pk.marks) {
          if (m < t0) continue;
          const x = ((m - t0) / SPAN_MS) * w;
          g.globalAlpha = 0.55;
          g.beginPath();
          g.moveTo(x, mid - amp);
          g.lineTo(x, mid + amp);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    };

    const off = ctx.subscribe((samples) => {
      const p = pts.current;
      const g = countingRef.current ? peekRef.current?.() : null;
      if (g && samples.length) {
        // The counter's decision signal — the load's vertical speed — scaled
        // so a rep fills the strip: above the line going up, below coming down.
        p.push([samples.at(-1).t, g.trace]);
      } else {
        // Deviation from 1g: still is flat, motion swings either way.
        for (const s of samples) p.push([s.t, ((s.amag ?? 1) - 1) * 1.2]);
      }
      const cut = Date.now() - SPAN_MS - 500;
      while (p.length && p[0][0] < cut) p.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    });

    // Repaint while idle too, so the trace scrolls off instead of freezing
    // mid-screen when the sensor drops, and the square wave keeps moving.
    const tick = setInterval(() => { if (!raf) raf = requestAnimationFrame(draw); }, 100);
    draw();
    return () => { off(); clearInterval(tick); if (raf) cancelAnimationFrame(raf); };
  }, [ctx?.subscribe]);

  // A fresh link starts a fresh trace, not the tail of the one that dropped.
  useEffect(() => {
    if (!linked) pts.current = [];
  }, [linked]);

  if (!repTracking(ctx)) return null;

  const connecting = status === 'connecting';
  const recording = linked && ctx.alpha;
  const phase = ctx.phase;
  const reconnect = () => { if (!linked && !connecting) ctx.sensor.connect(); };

  // Guided mode takes the strip over while a set is live: a count big enough to
  // read from a propped-up phone mid-set, which a 10px tag is not.
  const guidedLive = linked && recording && ctx.guided && phase !== 'idle';
  if (guidedLive) {
    const [big, sub, col] = phase === 'hold'
      ? [String(ctx.holdLeft), 'HOLD STILL', 'var(--color-accent)']
      : phase === 'counting' ? [String(ctx.liveCount), 'COUNTING', '#ff2222']
        : [String(ctx.liveCount), 'SET DONE', 'var(--color-accent)'];
    return (
      <div className="absolute z-40 pointer-events-none flex items-end gap-3" style={{ left: 12, right: 12, bottom: 'calc(64px * var(--stage-k, 1))', height: 46 }}>
        <button type="button" onClick={() => (phase === 'done' ? ctx.startSet() : ctx.cancelSet())}
          aria-label={phase === 'done' ? 'Start another set' : 'Stop counting this set'}
          className="pointer-events-auto flex-shrink-0 flex items-baseline gap-1.5 font-mono text-left">
          <span style={{ fontSize: 38, lineHeight: 0.85, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 10px ${col}` }}>{big}</span>
          <span style={{ fontSize: 8, letterSpacing: '.14em', color: col, opacity: 0.75 }}>{sub}</span>
        </button>
        <canvas ref={cv} className="flex-1 min-w-0 block" style={{ height: 34 }} />
        <style>{STRIP_CSS}</style>
      </div>
    );
  }

  return (
    <div className="absolute z-40 pointer-events-none flex items-center gap-2" style={{ left: 12, right: 12, bottom: 'calc(64px * var(--stage-k, 1))', height: 18 }}>
      {linked ? (
        // Same thumb-sized hit area as the reconnect dot, drawn as a dot.
        <button type="button" onClick={() => ctx.setAlpha(!recording)} aria-pressed={recording}
          aria-label={recording ? 'Stop recording sets for the rep tracker' : 'Record sets for the rep tracker'}
          className="pointer-events-auto flex-shrink-0 flex items-center gap-1.5 font-mono"
          style={{ fontSize: 8, letterSpacing: '.14em', color: recording ? 'var(--color-accent)' : 'var(--color-text-tertiary)', margin: '-12px -8px', padding: '12px 8px' }}>
          <span className={recording ? 'rep-rec-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: recording ? 'var(--color-accent)' : 'transparent', boxShadow: recording ? '0 0 6px var(--color-accent)' : 'inset 0 0 0 1.5px var(--color-text-tertiary)' }} />
          <span style={{ opacity: 0.75 }}>{recording ? `REC ${ctx.saved}` : 'REPS OFF'}</span>
        </button>
      ) : (
        // A real button with a thumb-sized hit area, though it draws as a dot.
        <button type="button" onClick={reconnect} disabled={connecting}
          aria-label={connecting ? 'Connecting to the rep tracker' : 'Reconnect the rep tracker'}
          className="pointer-events-auto flex-shrink-0 flex items-center gap-1.5 font-mono"
          style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--color-text-tertiary)', margin: '-12px -8px', padding: '12px 8px' }}>
          <span className={connecting ? 'rep-rec-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-text-tertiary)' }} />
          <span>{connecting ? 'LINKING…' : 'TAP TO LINK'}</span>
        </button>
      )}
      <canvas ref={cv} className="flex-1 min-w-0 block" style={{ height: 18 }} />
      <style>{STRIP_CSS}</style>
    </div>
  );
}

/**
 * The rep tracker's control, in the exercise card's tag slot, where the eye
 * already is between sets — the dot under the battle scene is easy to miss,
 * which is how a whole session recorded nothing.
 *
 * In guided mode this is the set's whole interface: START SET → HOLD STILL 5
 * → a live count → the final count. Otherwise it is the recording switch, and
 * when the link has dropped, the reconnect button.
 */
export function RepTag() {
  const ctx = useRepSensorCtx();
  const status = ctx?.sensor?.status;
  const linked = status === 'linked';
  const connecting = status === 'connecting';
  if (!repTracking(ctx)) return null;
  const recording = linked && ctx.alpha;
  const guided = linked && recording && ctx.guided;
  const phase = ctx.phase;

  // Guided mode owns the slot while it is running: the tag becomes the set's
  // own control, which is the only thing worth looking at between sets.
  const g = !guided ? null
    : phase === 'hold' ? [`HOLD STILL ${ctx.holdLeft}`, 'var(--color-accent)', 'Hold still — capturing the start position. Tap to cancel.', ctx.cancelSet]
      : phase === 'counting' ? [`● ${ctx.liveCount}`, '#ff2222', `Counting reps: ${ctx.liveCount} so far. Tap to stop.`, ctx.cancelSet]
        : phase === 'done' ? [`${ctx.liveCount} REPS`, 'var(--color-accent)', 'Set finished. Tap to start another.', ctx.startSet]
          : ctx.holdFailed ? ['HOLD STILL', '#f59e0b', 'That hold was not still enough. Tap to try again.', ctx.startSet]
            : ['START SET', '#ff2222', 'Start the set and capture the start position', ctx.startSet];

  const [label, col, aria, tap] = g || (connecting
    ? ['LINKING…', 'var(--color-text-tertiary)', 'Connecting to the rep tracker', null]
    : !linked ? ['RECONNECT', 'var(--color-text-tertiary)', 'Reconnect the rep tracker', () => ctx.sensor.connect()]
      : recording ? ['REC', '#ff2222', 'Stop recording sets for the rep tracker', () => ctx.setAlpha(false)]
        // Off is grey, like the trace: colour means a set is being saved.
        : ['REPS OFF', 'var(--color-text-tertiary)', 'Record sets for the rep tracker', () => ctx.setAlpha(true)]);

  return (
    // The tag keeps its size; the button around it is the thumb-sized target.
    <button type="button" onClick={() => tap && tap()} disabled={connecting || !tap} aria-label={aria}
      aria-pressed={linked && !guided ? recording : undefined}
      className="flex-shrink-0" style={{ margin: '-10px -8px', padding: '10px 8px' }}>
      <span className={`g-tag${phase === 'counting' && guided ? ' rep-rec-dot' : ''}`} style={{ '--tag': col }}>{label}</span>
    </button>
  );
}

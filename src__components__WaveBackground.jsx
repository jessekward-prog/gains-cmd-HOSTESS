import { useEffect, useRef, useState } from 'react';
import { moodState, deriveMood, MOODS } from '../lib/mood';

// The live "Waves" background from the Claude Design handoff (LIVE_BACKGROUND.md):
// XMB-style ribbons behind every screen that react to the app — calm grey
// lines when nothing is happening, colour and fill only during an event (rest,
// set done, PR, BFR, intervals), every change crossfaded over ~1s. It reads
// moodState each frame and eases toward the targets it derives from it.
export const WAVE_KEY = 'gains-cmd-waves';
export const readWaveStyle = () => {
  try { return localStorage.getItem(WAVE_KEY) === 'off' ? 'off' : 'xmb'; } catch { return 'xmb'; }
};

const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Any CSS colour → [r,g,b] through the canvas parser (handles #hex and rgba()).
function rgb(ctx, css, fallback) {
  ctx.fillStyle = fallback;
  ctx.fillStyle = css || fallback;
  const v = ctx.fillStyle;
  if (v.startsWith('#')) return v.slice(1).match(/\w\w/g).map((h) => parseInt(h, 16));
  return v.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
}

export default function WaveBackground() {
  const canvasRef = useRef(null);
  const [style, setStyle] = useState(readWaveStyle);

  useEffect(() => {
    const onChange = () => setStyle(readWaveStyle());
    window.addEventListener('gains-waves', onChange);
    window.addEventListener('storage', onChange);
    return () => { window.removeEventListener('gains-waves', onChange); window.removeEventListener('storage', onChange); };
  }, []);

  useEffect(() => {
    if (style === 'off') return;
    const cv = canvasRef.current;
    const g = cv.getContext('2d');

    // Theme tokens, re-read twice a second (accent override changes don't reload).
    let tok = {}, light = false, lastTok = -1;
    const readTokens = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n, f) => rgb(g, cs.getPropertyValue(n).trim(), f);
      tok = { accent: v('--color-accent', '#ff2222'), success: v('--color-success', '#22c55e'), error: v('--color-error', '#ef4444'), t3: v('--color-text-tertiary', '#6b6b6b') };
      light = document.documentElement.classList.contains('mode-light');
    };
    readTokens();
    const colour = (c) => tok[c] || rgb(g, c, '#ffffff');

    // Eased state, chased toward the derived targets each frame.
    const first = deriveMood(moodState, Date.now());
    let c = [...tok.t3], k = 0.35, f = 0, sp = 1 / MOODS[first.mood][2], y = first.base;
    let swell = 0, t = Math.random() * 100, lastPulse = moodState.pulse;
    const dots = Array.from({ length: 12 }, () => ({
      x: Math.random(), y: 0.25 + Math.random() * 0.6, r: 0.6 + Math.random() * 1.6, v: 0.004 + Math.random() * 0.012, ph: Math.random() * 6.28,
    }));

    let W = 0, H = 0;
    const size = () => {
      // 32-Bit Night renders the waves at a third of the resolution, scaled up pixelated.
      // Read from storage: this effect runs before ThemeContext puts the class on <html>.
      let pixel = false; try { pixel = localStorage.getItem('gains-cmd-theme') === 'bit32'; } catch {}
      const dpr = pixel ? 1 / 3 : Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    addEventListener('resize', size);

    let raf, prev = performance.now();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      // Every mood drifts slowly enough that ~30fps reads the same and halves
      // the cost; only the quick swell after a completed set gets every frame.
      if (swell < 0.05 && now - prev < 32) return;
      const dt = Math.min(0.05, (now - prev) / 1000); // clamp: no jump after a backgrounded tab
      prev = now;
      if (now - lastTok > 500) { readTokens(); lastTok = now; }

      const { mood, base } = deriveMood(moodState, Date.now());
      const [mc, mp0, spd] = MOODS[mood];
      const mp = Math.round(mp0 * (light ? 0.7 : 1));
      const calm = mood === 'idle' || mood === 'work';
      const tc = calm ? tok.t3 : colour(mc), tk = calm ? 0.35 : Math.min(1, mp / 45), tf = calm ? 0 : 1;

      const e = 1 - Math.pow(0.04, dt); // ~1s to settle, framerate-independent
      c = c.map((v, i) => v + (tc[i] - v) * e);
      k += (tk - k) * e; f += (tf - f) * e; sp += (1 / spd - sp) * e; y += (base - y) * e * 0.6;
      if (moodState.pulse !== lastPulse) { lastPulse = moodState.pulse; swell = 1; }
      swell *= Math.pow(0.25, dt);
      if (!reduceMotion) t += dt * (0.35 + sp * 0.9) * (1 + swell * 1.5); // reduced motion: colour still fades, waves hold still

      const [r, gg, b] = c.map(Math.round), col = (a) => `rgba(${r},${gg},${b},${a})`;
      g.clearRect(0, 0, W, H);
      if (k * f > 0.002) { // the full-screen tint is the costliest fill — skip it while invisible
        const bg = g.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, col(0.03 * k * f)); bg.addColorStop(0.55, col(0.18 * k * f)); bg.addColorStop(1, col(0.07 * k * f));
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
      }

      g.globalCompositeOperation = light ? 'source-over' : 'lighter';
      const amp = 38 + swell * 40, cy = H * y;
      const curve = (o, a, fr, ph) => (x) => cy + o + Math.sin(x * fr + t * ph) * a + Math.sin(x * fr * 2.3 - t * ph * 0.7 + o * 0.02) * a * 0.35;
      const tint = light ? [r * 0.6, gg * 0.6, b * 0.6].map(Math.round) : [Math.min(255, r + 90), Math.min(255, gg + 90), Math.min(255, b + 90)];
      const tcol = (a) => `rgba(${tint[0]},${tint[1]},${tint[2]},${a})`;
      // Curve frequencies were tuned on a 390px-wide phone; keep the same number
      // of crests on wider screens rather than squeezing in more.
      const sx = 390 / Math.max(W, 1);

      const top = curve(0, amp, 0.0075 * sx, 0.9), bot = curve(40, amp * 0.9, 0.009 * sx, 0.72);
      g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, top(x));
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, bot(x));
      g.closePath();
      if (f > 0.01) {
        const lg = g.createLinearGradient(0, cy - amp, 0, cy + amp + 120);
        lg.addColorStop(0, tcol(0)); lg.addColorStop(0.4, tcol((0.08 * k + 0.02) * f)); lg.addColorStop(1, tcol(0));
        g.fillStyle = lg; g.fill();
      }

      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const fn = curve(i * 7 - 18, amp * (0.6 + i / 14), (0.0068 + i * 0.0002) * sx, 0.8 + i * 0.03);
        g.beginPath();
        for (let x = -4; x <= W + 4; x += 5) g.lineTo(x, fn(x));
        g.strokeStyle = tcol((0.06 + 0.14 * k) * (1 - Math.abs(i - 2.5) / 4.5));
        g.stroke();
      }

      for (const d of dots) {
        if (!reduceMotion) d.x = (d.x + d.v * dt * (1 + sp)) % 1;
        const x = d.x * W, yy = cy + (d.y - 0.5) * 260 + Math.sin(t + d.ph) * 18;
        const a = (0.15 + 0.3 * k) * (0.5 + 0.5 * Math.sin(t * 2 + d.ph));
        g.beginPath(); g.arc(x, yy, d.r + swell * 1.5, 0, 6.29); g.fillStyle = tcol(a); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, [style]);

  if (style === 'off') return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }} />;
}

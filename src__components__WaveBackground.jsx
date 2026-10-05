import { useEffect, useRef, useState } from 'react';

// Ported from chat-cmd's WaveBackground (itself apps-cmd's XMB wave): sine
// bands + drifting particles, here as one full-viewport layer behind every
// page. Colours come from the live theme tokens, so all themes and the accent
// override work without a list of their own.
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const WAVE_KEY = 'gains-cmd-waves';
export const readWaveStyle = () => { try { return localStorage.getItem(WAVE_KEY) || 'bands'; } catch { return 'bands'; } };

// Any CSS colour → [r,g,b] via the canvas parser (handles #hex and rgba()).
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

  // Settings writes the key and fires this event so the change is live.
  useEffect(() => {
    const onChange = () => setStyle(readWaveStyle());
    window.addEventListener('gains-waves', onChange);
    window.addEventListener('storage', onChange);
    return () => { window.removeEventListener('gains-waves', onChange); window.removeEventListener('storage', onChange); };
  }, []);

  useEffect(() => {
    if (style === 'off') return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    let raf, t = 0, frame = 0, last = 0, A = [255, 34, 34], S = [120, 90, 180];
    const resolve = () => {
      const cs = getComputedStyle(document.documentElement);
      A = rgb(ctx, cs.getPropertyValue('--color-accent').trim(), '#ff2222');
      S = rgb(ctx, cs.getPropertyValue('--color-text-tertiary').trim(), '#786ab4');
    };
    const parts = Array.from({ length: 24 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4, s: 0.02 + Math.random() * 0.05,
    }));
    const bands = [
      { amp: 40, len: 0.9, sp: 0.18, y: 0.55, a: 0.14, tint: true },
      { amp: 65, len: 0.6, sp: 0.12, y: 0.65, a: 0.11, tint: true },
      { amp: 85, len: 0.4, sp: 0.08, y: 0.75, a: 0.08, tint: false },
    ];
    const size = () => {
      const d = 1; // soft gradients look the same at 1x, at a fraction of the fill cost
      cv.width = innerWidth * d;
      cv.height = innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    resolve();
    addEventListener('resize', size);

    const draw = (now = 0) => {
      raf = requestAnimationFrame(draw);
      // ~30fps is plenty for a slow background and halves the battery cost;
      // time-based so the drift speed is the same at any frame rate.
      const dt = now - last;
      if (dt < 32) return;
      last = now;
      if (++frame % 30 === 0) resolve(); // picks up accent changes that don't reload the page
      const k = Math.min(dt, 100) / 16.7;
      t += (reduceMotion ? 0.0004 : 0.002) * k;
      const W = innerWidth, H = innerHeight;
      ctx.clearRect(0, 0, W, H);
      for (const b of bands) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const p = x / W;
          const y = H * b.y + Math.sin(p * 6.28 * b.len + t / b.sp) * b.amp + Math.sin(p * 15.7 * b.len - (t / b.sp) * 1.7) * b.amp * 0.3;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const c = (b.tint ? A : S).join(',');
        if (style === 'outline') {
          ctx.strokeStyle = `rgba(${c},${b.a * 5})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.lineTo(W, H);
          ctx.lineTo(0, H);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, H * b.y - b.amp, 0, H);
          g.addColorStop(0, `rgba(${c},${b.a})`);
          g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g;
          ctx.fill();
        }
      }
      for (const p of parts) {
        p.y -= p.s * (reduceMotion ? 0.0008 : 0.004) * k;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r, 0, 6.28);
        ctx.fillStyle = `rgba(${A.join(',')},0.32)`;
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, [style]);

  if (style === 'off') return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }} />;
}

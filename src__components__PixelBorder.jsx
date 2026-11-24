import { useEffect, useRef } from 'react';
import { W, H, MARGIN, paintBorder } from '../lib/borders';

const pc = (v, of) => `${(v / of) * 100}%`;
/** Where the card's face sits inside a border `T` cells thick (the box is 5:7). */
export const faceInset = (T) => ({ position: 'absolute', left: pc(T, W), right: pc(T, W), top: pc(T, H), bottom: pc(T, H) });
/** Pixel border `k` laid over its 5:7 parent, spilling MARGIN cells outside it. */
export default function PixelBorder({ k, f = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current.getContext('2d');
    g.clearRect(0, 0, W + 2 * MARGIN, H + 2 * MARGIN);
    paintBorder(g, k, f);
  }, [k, f]);
  return (
    <canvas ref={ref} width={W + 2 * MARGIN} height={H + 2 * MARGIN} aria-hidden="true" className="absolute pointer-events-none max-w-none"
      style={{ left: pc(-MARGIN, W), top: pc(-MARGIN, H), width: pc(W + 2 * MARGIN, W), height: pc(H + 2 * MARGIN, H), imageRendering: 'pixelated' }} />
  );
}

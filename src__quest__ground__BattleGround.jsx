import { useEffect, useRef } from 'react';
import { W, H } from './camera';
import { blit } from './blit';
import { peekGround } from './cache';

// The ground canvas. Last child of the backdrop wrapper, so it shakes with the
// backdrop and is clipped by the stage's 28px corners for free.
//
// Backing store is always 390x340 whatever the DPR: the art grid IS the CSS pixel
// grid, and the browser's nearest-neighbour upscale matches every existing sprite.
//
// Width is 100%, NOT 390px. The stage is flex-shrink-0 with no width, so it fills
// the viewport, and on any phone wider than 390 a fixed-width canvas leaves bare
// stage down the right-hand side. The old floor div was left-0 right-0, which is
// why this never showed before. The backing store stays 390 and stretches; that
// costs a few px of horizontal drift against the left-anchored hero, which is far
// cheaper than a black gap.
export default function BattleGround({ renderer, bakeKey, accentRGB, reducedMotion }) {
  const ref = useRef(null);
  const accent = accentRGB.join();

  useEffect(() => {
    const baked = peekGround(bakeKey), cv = ref.current;
    if (!baked || !cv) return;
    const g = cv.getContext('2d'), img = g.createImageData(W, H);
    blit(baked, accentRGB, img);
    g.putImageData(img, 0, 0);

    if (!renderer.anim || reducedMotion) return;
    const out = new Float32Array(W * H), t0 = performance.now();
    let id;
    const tick = () => {
      const rows = renderer.frame(baked, (performance.now() - t0) / 1000, out);
      blit({ ...baked, L: out }, accentRGB, img, rows);
      if (rows) g.putImageData(img, 0, 0, 0, rows[0], W, rows[1] - rows[0]);
      else g.putImageData(img, 0, 0);
      id = setTimeout(tick, 1000 / renderer.anim.fps);
    };
    id = setTimeout(tick, 1000 / renderer.anim.fps);
    return () => clearTimeout(id);
  }, [bakeKey, accent, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas ref={ref} width={W} height={H} aria-hidden
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: H, imageRendering: 'pixelated', pointerEvents: 'none' }} />
  );
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import { prepare, render, getCachedFrame } from '../lib/dither';
import { revealing } from '../lib/reveal';

// A vault card drawn by the dither engine on its 360×504 canvas. Animated
// rarities (Epic, Legendary) redraw every 100ms; the rest draw once per change.
export const effCard = (card, rec) => (rec ? { ...card, name: rec.name || card.name, style: rec.style || card.style, pal: rec.pal || card.pal } : card);

export default function DitherCard({ card, img, phase = 0, still = false, className = '', style }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!card || !ref.current || phase !== 0) return;
    const cached = getCachedFrame(card, img);
    if (!cached) return;
    const ctx = ref.current.getContext('2d');
    if (ctx) ctx.drawImage(cached, 0, 0);
  }, [card?.id, card?.style, card?.pal, card?.rarity, img, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!card) return undefined;
    const hasCached = phase === 0 && !!getCachedFrame(card, img);
    if (hasCached && (!card.anim || still)) return undefined;
    let live = true, id = null, t = phase;
    prepare(card, img).then((p) => {
      if (!live || !p || !ref.current) return;
      if (!hasCached) render(ref.current, card, p, t);
      if (card.anim && !still) {
        id = setInterval(() => {
          if (revealing() || !ref.current) return;
          t += 0.1;
          render(ref.current, card, p, t);
        }, 100);
      }
    });
    return () => { live = false; clearInterval(id); };
  }, [card?.id, card?.style, card?.pal, card?.anim, img, still, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width="360" height="504" className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }} />;
}

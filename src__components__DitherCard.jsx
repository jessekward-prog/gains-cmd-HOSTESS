import { useEffect, useRef } from 'react';
import { prepare, render } from '../lib/dither';

// A vault card drawn by the dither engine on its 360×504 canvas. Animated
// rarities (Epic, Legendary) redraw every 100ms; the rest draw once per change.
export const effCard = (card, rec) => (rec ? { ...card, name: rec.name || card.name, style: rec.style || card.style, pal: rec.pal || card.pal } : card);

export default function DitherCard({ card, img, phase = 0, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!card) return;
    let live = true, id = null, t = phase;
    prepare(card, img).then((p) => {
      if (!live || !p || !ref.current) return;
      render(ref.current, card, p, t);
      if (card.anim) id = setInterval(() => { t += 0.1; if (ref.current) render(ref.current, card, p, t); }, 100);
    });
    return () => { live = false; clearInterval(id); };
  }, [card?.id, card?.style, card?.pal, card?.anim, img]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width="360" height="504" className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }} />;
}

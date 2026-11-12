import { useEffect, useRef, useState } from 'react';

// Text that scrolls like a ticker tape when it doesn't fit, and sits still when it does.
// It measures a hidden copy that never changes, so switching between still and
// scrolling can't swap out the thing being measured (which made it flicker).
// `retype`: every 20–30 s the text clears and types itself back in with a cursor
// (as it does when it first appears), then scrolls again if it doesn't fit.
export default function Ticker({ children, style, retype = false }) {
  const box = useRef(null), probe = useRef(null);
  const [over, setOver] = useState(false);
  const [typed, setTyped] = useState(retype ? 0 : null); // chars shown while typing, null = settled
  useEffect(() => {
    if (!retype) return;
    const text = String(children);
    let t, n = 0;
    const typeIn = () => { n = 0; const step = () => { setTyped(++n); t = setTimeout(n < text.length ? step : () => { setTyped(null); wait(); }, 70); }; setTyped(0); t = setTimeout(step, 70); };
    const wait = () => { t = setTimeout(typeIn, 20000 + Math.random() * 10000); };
    typeIn();
    return () => clearTimeout(t);
  }, [retype, children]);
  useEffect(() => {
    const check = () => setOver(!!box.current && !!probe.current && probe.current.offsetWidth > box.current.clientWidth + 1);
    check();
    // Box resizes, and the text growing once the web font arrives.
    const ro = new ResizeObserver(check);
    ro.observe(box.current);
    ro.observe(probe.current);
    document.fonts?.ready.then(check);
    return () => ro.disconnect();
  }, [children]);
  const gap = '  ·  ';
  return (
    <span ref={box} className="relative block min-w-0 flex-1 overflow-hidden whitespace-nowrap" style={style}>
      <span ref={probe} aria-hidden="true" className="absolute invisible">{children}</span>
      {typed !== null ? (
        <span className="inline-block">{String(children).slice(0, typed)}<span style={{ opacity: 0.7 }}>_</span></span>
      ) : over ? (
        <span className="inline-block" style={{ animation: `fx-ticker ${Math.max(6, String(children).length * 0.35)}s linear infinite` }}>
          {children}{gap}{children}{gap}
        </span>
      ) : <span className="inline-block">{children}</span>}
    </span>
  );
}

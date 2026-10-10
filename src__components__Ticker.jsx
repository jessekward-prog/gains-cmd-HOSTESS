import { useEffect, useRef, useState } from 'react';

// Text that scrolls like a ticker tape when it doesn't fit, and sits still when it does.
// It measures a hidden copy that never changes, so switching between still and
// scrolling can't swap out the thing being measured (which made it flicker).
export default function Ticker({ children, style }) {
  const box = useRef(null), probe = useRef(null);
  const [over, setOver] = useState(false);
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
      {over ? (
        <span className="inline-block" style={{ animation: `fx-ticker ${Math.max(6, String(children).length * 0.35)}s linear infinite` }}>
          {children}{gap}{children}{gap}
        </span>
      ) : <span className="inline-block">{children}</span>}
    </span>
  );
}

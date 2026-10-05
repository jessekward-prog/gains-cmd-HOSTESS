import { useState, useEffect, useRef } from 'react';

const CHAR_DELAY = 25;
const RETYPE_MIN = 20000;
const RETYPE_MAX = 30000;

export default function TypewriterName({ text, active = true, className = '' }) {
  const [displayText, setDisplayText] = useState(text);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!active) { setDisplayText(text); return; }
    let cancelled = false;

    function scheduleRetype() {
      const delay = RETYPE_MIN + Math.random() * (RETYPE_MAX - RETYPE_MIN);
      timeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        let i = 0;
        setDisplayText('');
        function typeChar() {
          if (cancelled) return;
          i++;
          setDisplayText(text.slice(0, i));
          if (i < text.length) {
            timeoutRef.current = setTimeout(typeChar, CHAR_DELAY);
          } else {
            scheduleRetype();
          }
        }
        typeChar();
      }, delay);
    }

    // Type the name in whenever it changes, then retype it every so often.
    let i = 0;
    setDisplayText('');
    (function typeIn() {
      if (cancelled) return;
      setDisplayText(text.slice(0, ++i));
      if (i < text.length) timeoutRef.current = setTimeout(typeIn, CHAR_DELAY);
      else scheduleRetype();
    })();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, active]);

  return (
    <span className={className}>
      {displayText}
      <span className="text-text-primary animate-cursor-blink">_</span>
    </span>
  );
}

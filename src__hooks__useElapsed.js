import { useState, useRef, useEffect } from 'react';

export function useElapsed(startTimeISO) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!startTimeISO) {
      setElapsed(0);
      return;
    }

    const start = new Date(startTimeISO).getTime();

    const tick = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTimeISO]);

  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const display = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  return { elapsed, display };
}

import { useState, useMemo, useCallback } from 'react';
import { localDate } from '../lib/history';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONO = 'var(--font-mono)';

// Monday-first month grid, padded with the neighbouring months' days so every
// row is full. Any day can be picked — an empty one reads as a rest day.
export default function Calendar({ workoutDates, selectedDate, onSelectDate }) {
  const today = new Date();
  const start = selectedDate ? new Date(selectedDate + 'T12:00:00') : today;
  const [month, setMonth] = useState(start.getMonth());
  const [year, setYear] = useState(start.getFullYear());

  const shift = useCallback((d) => {
    setMonth((m) => {
      const n = m + d;
      if (n < 0) { setYear((y) => y - 1); return 11; }
      if (n > 11) { setYear((y) => y + 1); return 0; }
      return n;
    });
  }, []);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1, 12);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const count = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(year, month, 1 - lead + i, 12));
  }, [year, month]);

  const todayKey = localDate(today);

  return (
    <div>
      <div className="flex justify-between items-center px-1 pb-3">
        <span className="text-base font-extrabold">{MONTHS[month]} {year}</span>
        <span className="flex gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous month" className="w-8 h-8 rounded-[8px] text-text-tertiary active:bg-bg-2" style={{ font: `400 14px ${MONO}` }}>‹</button>
          <button onClick={() => shift(1)} aria-label="Next month" className="w-8 h-8 rounded-[8px] text-text-tertiary active:bg-bg-2" style={{ font: `400 14px ${MONO}` }}>›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5 text-center text-text-tertiary" style={{ font: `500 10px ${MONO}` }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const key = localDate(d);
          const has = workoutDates?.has?.(key);
          const sel = key === selectedDate;
          const isToday = key === todayKey;
          const inMonth = d.getMonth() === month;
          const future = key > todayKey;
          return (
            <button key={key} onClick={() => onSelectDate(key)}
              className="relative aspect-square rounded-[14px] transition-colors"
              style={{
                font: `${isToday ? 800 : 600} 14px var(--font-display)`,
                background: sel ? 'var(--color-accent)' : has ? 'var(--color-bg-2)' : 'transparent',
                color: sel ? 'var(--color-on-accent)' : !inMonth || future ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                opacity: future ? 0.5 : 1,
                boxShadow: isToday && !sel ? 'inset 0 0 0 1.5px var(--color-accent)' : 'none',
              }}>
              {d.getDate()}
              {has && (
                <span className="absolute left-1/2 bottom-1.5 w-1 h-1 -ml-0.5 rounded-[2px]"
                  style={{ background: sel ? 'var(--color-on-accent)' : 'var(--color-accent)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

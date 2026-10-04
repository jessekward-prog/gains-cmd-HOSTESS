import { useState, useEffect, useCallback } from 'react';

const MONO = 'var(--font-mono)';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

async function post(url, pin) {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
}

// Hostess requires every app behind a PIN. Children (and their auth/data
// requests) only mount once the server confirms we're unlocked, so nothing
// races the unlock and gets bounced with a 401.
export default function PinGate({ children }) {
  const [state, setState] = useState('loading'); // loading | setup | confirm | unlock | open
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/pin', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setState(d.unlocked ? 'open' : d.set ? 'unlock' : 'setup'))
      .catch(() => setState('open')); // offline: let the app's own offline fallback take over
  }, []);

  const submit = useCallback(async () => {
    if (pin.length < 4) { setError('At least 4 digits'); return; }
    setError('');
    if (state === 'setup') { setFirst(pin); setPin(''); setState('confirm'); return; }
    try {
      if (state === 'confirm') {
        if (pin !== first) { setError("PINs don't match — start again"); setPin(''); setFirst(''); setState('setup'); return; }
        await post('/api/pin/setup', pin);
      } else {
        await post('/api/pin/unlock', pin);
      }
      setState('open');
    } catch (e) { setError(e.message); setPin(''); }
  }, [pin, first, state]);

  const press = useCallback((k) => {
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k === 'ok') submit();
    else setPin((p) => (p.length < 8 ? p + k : p));
  }, [submit]);

  useEffect(() => {
    if (state === 'open' || state === 'loading') return;
    const onKey = (e) => {
      // e.code also catches the numpad with Num Lock off, where e.key is 'Home' etc.
      const digit = /^[0-9]$/.test(e.key) ? e.key : /^Numpad[0-9]$/.test(e.code) ? e.code.slice(6) : null;
      if (digit) press(digit);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' || e.code === 'NumpadEnter') press('ok');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, press]);

  if (state === 'open') return children;
  if (state === 'loading') return <div className="min-h-dvh bg-bg-0" />;

  const title = state === 'setup' ? 'Set a PIN' : state === 'confirm' ? 'Confirm your PIN' : 'Enter PIN';
  const sub = state === 'unlock' ? 'This Gains_CMD is locked.' : state === 'setup' ? 'Anyone opening this app will need it. 4–8 digits.' : 'Type it once more.';
  return (
    <div className="g-root min-h-dvh bg-bg-0 flex flex-col items-center justify-center px-8 fx-in">
      <div className="text-accent" style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em' }}>GAINS_CMD</div>
      <h1 className="mt-3 text-center" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>{title}</h1>
      <p className="mt-2 text-sm text-text-secondary text-center">{sub}</p>
      <div className="flex gap-3 mt-8 h-4" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className="w-3.5 h-3.5 rounded-full transition-colors" style={{ background: i < pin.length ? 'var(--color-accent)' : 'var(--color-bg-3)' }} />
        ))}
      </div>
      <div className="mt-3 h-5 text-error text-center" style={{ font: `400 12px ${MONO}` }}>{error}</div>
      <div className="grid grid-cols-3 gap-2.5 mt-4 w-full max-w-[300px]">
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k === 'ok' ? 'Submit' : k}
            className="h-16 rounded-[20px] active:scale-95 transition-transform"
            style={{
              background: k === 'ok' ? 'var(--color-accent)' : 'var(--color-bg-1)',
              color: k === 'ok' ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
              font: k === 'del' || k === 'ok' ? `600 18px ${MONO}` : '700 26px var(--font-display)',
            }}>
            {k === 'del' ? '⌫' : k === 'ok' ? '→' : k}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import { useRepSensorCtx } from '../context/RepSensorContext';
import { useToast } from '../context/ToastContext';
import { sensorSupported } from '../hooks/useRepSensor';

// The rep tracker is offered on the way into any workout, never mid-set, and the
// answer only holds for that workout. A browser with no Web Bluetooth is never
// asked a question it can't act on.
// `offer(start)` runs `start` once the questions are answered; `prompts` must be rendered.
export default function useRepStartPrompt() {
  const { sensor, setAlpha, setGuided, setAuto } = useRepSensorCtx();
  const { showToast } = useToast();
  const [askSensor, setAskSensor] = useState(false);
  const [askGuided, setAskGuided] = useState(false);
  const [draft, setDraft] = useState({ count: true, accept: false, progress: false });
  const pending = useRef(null);

  const run = () => { const start = pending.current; pending.current = null; start?.(); };

  const offer = useCallback((start) => {
    if (!sensorSupported()) { start(); return; }
    pending.current = start;
    setAskSensor(true);
  }, []);

  const pairThenStart = async () => {
    setAskSensor(false);
    setAlpha(true);
    // requestDevice needs the tap that opened this dialog still counting as a
    // user gesture, so nothing may be awaited before connect().
    const ok = sensor.status === 'linked' ? true : await sensor.connect();
    // Guided counting is only worth offering once the sensor is actually on the
    // wrist — it is a per-set ritual, and there is nothing to guide without a
    // live link. A failed link goes straight into the workout instead.
    if (ok) { setDraft({ count: true, accept: false, progress: false }); setAskGuided(true); return; }
    // The answer stands even when the link fails: the workout shows a grey
    // record dot, and tapping it tries again.
    showToast('Rep tracker not connected — tap the grey record dot to retry.', 'error');
    setGuided(false);
    run();
  };
  const skipSensor = () => { setAskSensor(false); setAlpha(false); setGuided(false); run(); };
  const chooseGuided = (on) => {
    setAskGuided(false);
    setGuided(on);
    setAuto({ accept: on && draft.accept, progress: on && draft.progress });
    run();
  };
  const toggle = (key) => setDraft((d) => ({ ...d, [key]: !d[key] }));

  const prompts = (
    <>
      <ConfirmDialog open={askSensor}
        title="Use the rep tracker?"
        message="Would you like to pair with the rep tracker and record results for alpha testing? Each set's motion is saved against the reps you log, so the counter gets built from real sets rather than guesswork."
        confirmLabel="Use sensor" cancelLabel="Not this time"
        onConfirm={pairThenStart} onCancel={skipSensor}
        onDismiss={() => setAskSensor(false)} />

      <Modal open={askGuided} onClose={() => chooseGuided(false)} title="Rep tracker">
        <div className="flex flex-col gap-2">
          <Toggle label="Auto count" on={draft.count} onToggle={() => toggle('count')}
            help="Tap START SET and hold still for five seconds. The counter then counts every rep." />
          <Toggle label="Auto accept" on={draft.count && draft.accept} disabled={!draft.count} onToggle={() => toggle('accept')}
            help="Five seconds after a counted set ends, it is logged with the count." />
          <Toggle label="Auto progress" on={draft.count && draft.progress} disabled={!draft.count} onToggle={() => toggle('progress')}
            help="From set 2 on, when rest ends, the next five-second count-in starts by itself." />
        </div>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => chooseGuided(false)}
            className="flex-1 h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Just record</button>
          <button type="button" onClick={() => chooseGuided(true)}
            className="flex-1 h-12 rounded-[15px] bg-accent font-bold text-sm" style={{ color: 'var(--color-on-accent)' }}>Start</button>
        </div>
      </Modal>
    </>
  );

  return { offer, prompts };
}

function Toggle({ label, help, on, disabled, onToggle }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle}
      className="flex items-center gap-3 p-3 rounded-[15px] bg-bg-2 text-left disabled:opacity-40">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-text-primary">{label}</span>
        <span className="block text-[12px] text-text-tertiary">{help}</span>
      </span>
      <span className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors"
        style={{ background: on ? 'var(--color-accent)' : 'var(--color-bg-3)' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ left: 2, transform: on ? 'translateX(20px)' : 'none' }} />
      </span>
    </button>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { sensorSupported } from '../hooks/useRepSensor';
import { useRepSensorCtx } from '../context/RepSensorContext';
import { useHaptics } from '../hooks/useHaptics';
import { CMD, RATES, magnitude } from '../lib/witmotion';

const MONO = 'var(--font-mono)';
const CHANNELS = [['amag', '|accel|'], ['ax', 'ax'], ['ay', 'ay'], ['az', 'az'],
  ['gx', 'gx'], ['gy', 'gy'], ['gz', 'gz'], ['roll', 'roll'], ['pitch', 'pitch'], ['yaw', 'yaw']];

// Three poses, each meant to put gravity on a different axis. If the decode is
// right they disagree about which axis; if it's wrong they won't.
const POSES = [
  { id: 'flat', label: 'Flat on the bench, label up' },
  { id: 'edge', label: 'Rolled onto its long edge' },
  { id: 'end', label: 'Standing on one end' },
];
const CAPTURE_MS = 1500;

export default function SensorProbe({ open, onClose }) {
  const buf = useRef([]);          // rolling chart buffer
  const last = useRef(null);
  const stamps = useRef([]);       // arrival times, for the measured rate
  const sizes = useRef({});        // notification byte-length histogram
  const rec = useRef(null);
  const capture = useRef(null);

  const [view, setView] = useState({ s: null, hz: 0 });
  const [chan, setChan] = useState('amag');
  const [poses, setPoses] = useState({});
  const [capturing, setCapturing] = useState('');
  const [clips, setClips] = useState([]);
  const [label, setLabel] = useState('');
  const [truth, setTruth] = useState('');
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState('');

  const onSample = useCallback((samples, bytes) => {
    sizes.current[bytes.length] = (sizes.current[bytes.length] || 0) + 1;
    for (const s of samples) {
      s.amag = magnitude(s);
      last.current = s;
      buf.current.push(s);
      stamps.current.push(s.t);
      if (rec.current) rec.current.samples.push(s);
      if (capture.current) capture.current.samples.push(s);
    }
    if (buf.current.length > 600) buf.current.splice(0, buf.current.length - 600);
    const cutoff = Date.now() - 1000;
    while (stamps.current.length && stamps.current[0] < cutoff) stamps.current.shift();
  }, []);

  // One connection for the whole app: the probe listens to the shared stream
  // rather than opening a second GATT link the device would refuse.
  const { sensor, subscribe, saved } = useRepSensorCtx();
  useEffect(() => subscribe(onSample), [subscribe, onSample]);
  const haptics = useHaptics();

  // The link state used to live at the top of a long scrolling sheet, which is
  // exactly where you aren't looking when you tap Pair. Buzz on the transition.
  const wasLinked = useRef(false);
  useEffect(() => {
    const linkedNow = sensor.status === 'linked';
    if (linkedNow && !wasLinked.current) haptics.success();
    if (!linkedNow && wasLinked.current) haptics.tap();
    wasLinked.current = linkedNow;
  }, [sensor.status, haptics]);

  // 10 Hz is enough for the eye, and keeps a 50 Hz stream from re-rendering the
  // whole panel on every frame.
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setView({ s: last.current, hz: stamps.current.length }), 100);
    return () => clearInterval(id);
  }, [open]);

  // --- pose capture -------------------------------------------------------
  const runCapture = (id) => {
    if (sensor.status !== 'linked') return;
    capture.current = { samples: [] };
    setCapturing(id);
    setTimeout(() => {
      const s = capture.current?.samples || [];
      capture.current = null;
      setCapturing('');
      if (!s.length) { setNote('No samples arrived during that capture.'); return; }
      const mean = (k) => s.reduce((a, x) => a + x[k], 0) / s.length;
      const m = { ax: mean('ax'), ay: mean('ay'), az: mean('az') };
      const mag = Math.hypot(m.ax, m.ay, m.az);
      const magMean = mean('amag');
      const sd = Math.sqrt(s.reduce((a, x) => a + (x.amag - magMean) ** 2, 0) / s.length);
      const axis = ['ax', 'ay', 'az'].reduce((b, k) => (Math.abs(m[k]) > Math.abs(m[b]) ? k : b), 'ax');
      setPoses((p) => ({ ...p, [id]: { ...m, mag, sd, axis, n: s.length } }));
    }, CAPTURE_MS);
  };

  const verdict = (() => {
    const done = POSES.map((p) => poses[p.id]).filter(Boolean);
    if (done.length < POSES.length) return { state: 'pending', text: `${done.length} of ${POSES.length} poses captured` };
    const axes = new Set(done.map((d) => d.axis));
    const mags = done.every((d) => d.mag > 0.85 && d.mag < 1.15);
    const still = done.every((d) => d.sd < 0.08);
    if (axes.size === 3 && mags && still) return { state: 'pass', text: 'Decode confirmed — gravity lands on a different axis in each pose, magnitude holds at 1g.' };
    if (!mags) return { state: 'fail', text: 'Gravity magnitude is not 1g — the accel scale factor is wrong.' };
    if (axes.size < 3) return { state: 'fail', text: `Only ${axes.size} distinct axes across three poses — either a pose was repeated or the axis mapping is wrong.` };
    return { state: 'warn', text: 'Magnitudes are right but one capture was shaky. Re-take it holding the sensor still.' };
  })();

  // --- clips --------------------------------------------------------------
  const toggleRecord = () => {
    if (rec.current) {
      const r = rec.current;
      rec.current = null;
      setRecording(false);
      const t0 = r.samples[0]?.t ?? 0;
      setClips((c) => [...c, {
        label: label || 'clip',
        trueReps: Number(truth) || null,
        recordedAt: new Date().toISOString(),
        durationMs: (r.samples.at(-1)?.t ?? t0) - t0,
        hz: view.hz,
        fields: ['t', 'ax', 'ay', 'az', 'gx', 'gy', 'gz', 'roll', 'pitch', 'yaw'],
        samples: r.samples.map((s) => [s.t - t0,
          +s.ax.toFixed(4), +s.ay.toFixed(4), +s.az.toFixed(4),
          +s.gx.toFixed(2), +s.gy.toFixed(2), +s.gz.toFixed(2),
          +s.roll.toFixed(2), +s.pitch.toFixed(2), +s.yaw.toFixed(2)]),
      }]);
      setTruth('');
    } else {
      rec.current = { samples: [] };
      setRecording(true);
    }
  };

  const shareFile = async (name, text) => {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch { /* cancelled */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    setNote(`Saved ${name} to your downloads.`);
  };

  // --- report -------------------------------------------------------------
  const buildReport = () => {
    const st = sensor.stats();
    const types = Object.entries(st.types).map(([t, n]) => `0x${(+t).toString(16)}×${n}`).join(' ') || 'none';
    const sizeList = Object.entries(sizes.current).map(([b, n]) => `${b}B×${n}`).join(' ') || 'none';
    const poseLines = POSES.map((p) => {
      const d = poses[p.id];
      if (!d) return `- ${p.label}: not captured`;
      return `- ${p.label}: ax ${d.ax.toFixed(3)}  ay ${d.ay.toFixed(3)}  az ${d.az.toFixed(3)}  |a| ${d.mag.toFixed(3)}  sd ${d.sd.toFixed(3)}  → ${d.axis} (${d.n} samples)`;
    });
    const clipLines = clips.length
      ? clips.map((c) => `- ${c.label} · ${c.trueReps ?? '?'} reps · ${(c.durationMs / 1000).toFixed(1)}s · ${c.samples.length} samples`)
      : ['- none recorded'];
    return [
      '# Rep sensor probe report',
      `date: ${new Date().toISOString()}`,
      `device: ${sensor.deviceName || 'not connected'}`,
      `link: ${sensor.status}${sensor.error ? ` (${sensor.error})` : ''}`,
      `service found: ${sensor.found?.service || 'none'}`,
      `notify characteristic: ${sensor.found?.notify || 'none'}`,
      `write characteristic: ${sensor.found?.write || 'absent'}`,
      `web bluetooth: ${sensorSupported() ? 'present' : 'MISSING'}`,
      `adapter available: ${sensor.available === null ? 'unknown' : sensor.available}`,
      `secure context: ${window.isSecureContext}`,
      `display mode: ${standalone() ? 'installed PWA' : 'browser tab'}`,
      `user agent: ${navigator.userAgent}`,
      '',
      '## Stream',
      `measured rate: ${view.hz} Hz`,
      `frame types: ${types}`,
      `notification sizes: ${sizeList}`,
      `resync skips: ${st.skipped} bytes`,
      `checksum failures: ${st.badSum}`,
      '',
      '## Pose checks',
      ...poseLines,
      '',
      `verdict: ${verdict.state.toUpperCase()} — ${verdict.text}`,
      '',
      '## Clips',
      ...clipLines,
    ].join('\n');
  };

  const copyReport = async () => {
    const text = buildReport();
    try {
      await navigator.clipboard.writeText(text);
      setNote('Report copied — paste it into the chat.');
    } catch {
      await shareFile(`sensor-report-${Date.now()}.txt`, text);
    }
  };

  // --- chart --------------------------------------------------------------
  const cv = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = cv.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      const vals = buf.current.map((s) => s[chan]).filter((v) => typeof v === 'number');
      ctx.clearRect(0, 0, c.width, c.height);
      if (vals.length < 2) return;
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const y = (v) => c.height - ((v - lo) / (hi - lo)) * c.height;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(c.width, y(0)); ctx.stroke();
      // Canvas can't read a CSS variable, so resolve the theme's accent first.
      ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--color-accent').trim() || '#8b5cf6';
      ctx.lineWidth = 2; ctx.beginPath();
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * c.width;
        if (i) ctx.lineTo(x, y(v)); else ctx.moveTo(x, y(v));
      });
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, chan]);

  const s = view.s;
  const linked = sensor.status === 'linked';
  const num = (v) => (typeof v === 'number' ? v.toFixed(2) : '–');

  return (
    <Modal open={open} onClose={onClose} title="Rep sensor">
      <div className="p-4 flex flex-col gap-4">
        {!sensorSupported() && (
          <p className="text-[13px] text-error" style={{ lineHeight: 1.5 }}>
            This browser has no Web Bluetooth. Use Chrome on Android — iOS Safari will never support it.
          </p>
        )}

        {/* link — sticky, so the one fact you need never scrolls away */}
        <div className="flex items-center gap-2 sticky -top-4 z-10 -mx-4 -mt-4 px-4 py-3 bg-bg-1 border-b border-border"
          style={{ marginBottom: -4 }}>
          <span className="w-2 h-2 rounded-full" style={{ background: linked ? 'var(--g-ok)' : sensor.status === 'error' || sensor.status === 'dropped' ? 'var(--color-error)' : 'var(--color-text-tertiary)' }} />
          <span className="g-meta flex-1 truncate">{linked ? sensor.deviceName : sensor.status}</span>
          {linked
            ? <button onClick={sensor.disconnect} className="px-4 h-10 rounded-[15px] bg-bg-2 text-text-primary text-sm font-bold">Disconnect</button>
            : <button onClick={() => sensor.connect()} className="px-4 h-10 rounded-[15px] bg-accent text-sm font-bold" style={{ color: 'var(--color-on-accent)' }}>Connect</button>}
        </div>
        {!linked && sensorSupported() && (
          <button onClick={() => sensor.connect({ all: true })} className="g-meta text-left underline opacity-70">
            Not in the list? Show every nearby device
          </button>
        )}
        {sensor.error && <p className="text-[12px] text-error">{sensor.error}</p>}

        {/* Why a tap did nothing is never obvious from the button itself. */}
        {!linked && (
          <div className="rounded-2xl bg-bg-2 p-3" style={{ font: `400 11px ${MONO}` }}>
            <Diag ok={sensorSupported()} label="web bluetooth" bad="missing — not a Chromium browser" />
            <Diag ok={sensor.available !== false} label="adapter" bad="off or unavailable" pending={sensor.available === null} />
            <Diag ok={window.isSecureContext} label="secure context" bad="insecure origin" />
            <Diag ok label={standalone() ? 'installed PWA' : 'browser tab'} />
          </div>
        )}

        {/* readout */}
        <div className="rounded-2xl bg-bg-2 p-3" style={{ font: `400 12px ${MONO}` }}>
          <Row label="accel g" a={num(s?.ax)} b={num(s?.ay)} c={num(s?.az)} extra={`|a| ${num(s?.amag)}`} />
          <Row label="gyro °/s" a={num(s?.gx)} b={num(s?.gy)} c={num(s?.gz)} />
          <Row label="angle °" a={num(s?.roll)} b={num(s?.pitch)} c={num(s?.yaw)} />
          <Row label="rate" a={`${view.hz} Hz`} b="" c="" extra={Object.keys(sensor.stats().types).map((t) => `0x${(+t).toString(16)}`).join(' ')} />
          {sensor.found && (
            <div className="pt-1 mt-1 border-t border-border text-text-tertiary" style={{ fontSize: 10, wordBreak: 'break-all' }}>
              svc {sensor.found.service}<br />ntf {sensor.found.notify}
            </div>
          )}
        </div>

        {/* chart */}
        <div>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {CHANNELS.map(([id, name]) => (
              <button key={id} onClick={() => setChan(id)}
                className="px-3 h-8 rounded-xl text-[11px] font-bold shrink-0"
                style={{ background: chan === id ? 'var(--g-acc-soft)' : 'var(--color-bg-2)', color: chan === id ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                {name}
              </button>
            ))}
          </div>
          <canvas ref={cv} width={600} height={140} className="w-full rounded-2xl bg-bg-2" style={{ height: 140 }} />
        </div>

        {/* pose checks */}
        <div>
          <div className="g-label mb-2">Decode check</div>
          <p className="text-[12px] text-text-secondary mb-3" style={{ lineHeight: 1.5 }}>
            Hold the sensor in each pose and tap. Each one should put gravity on a different axis — that is what proves the decode, rather than the numbers merely looking plausible.
          </p>
          {POSES.map((p) => {
            const d = poses[p.id];
            return (
              <div key={p.id} className="flex items-center gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary truncate">{p.label}</div>
                  {d && <div className="g-meta">{d.axis} {d[d.axis] > 0 ? '+' : ''}{d[d.axis].toFixed(2)}g · |a| {d.mag.toFixed(2)}</div>}
                </div>
                <button disabled={!linked || !!capturing} onClick={() => runCapture(p.id)}
                  className="px-4 h-10 rounded-[15px] bg-bg-2 text-text-primary text-sm font-bold disabled:opacity-40">
                  {capturing === p.id ? 'Hold…' : d ? 'Re-take' : 'Capture'}
                </button>
              </div>
            );
          })}
          <p className="text-[12px] mt-2" style={{ lineHeight: 1.5, color: verdict.state === 'pass' ? 'var(--g-ok)' : verdict.state === 'fail' ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
            {verdict.text}
          </p>
        </div>

        {/* clips */}
        <div>
          <div className="g-label mb-2">Record a clip</div>
          <div className="flex gap-2 mb-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="exercise"
              className="flex-1 min-w-0 h-11 px-3 rounded-[15px] bg-bg-2 text-text-primary text-sm outline-none focus:ring-1 focus:ring-accent/40" />
            <input value={truth} onChange={(e) => setTruth(e.target.value)} placeholder="reps" inputMode="numeric"
              className="w-20 h-11 px-3 rounded-[15px] bg-bg-2 text-text-primary text-sm outline-none focus:ring-1 focus:ring-accent/40" />
          </div>
          <button disabled={!linked} onClick={toggleRecord}
            className="w-full h-12 rounded-[15px] font-bold text-sm disabled:opacity-40"
            style={recording ? { background: 'var(--color-error)', color: '#fff' } : { background: 'var(--color-bg-2)', color: 'var(--color-text-primary)' }}>
            {recording ? 'Stop' : 'Record'}
          </button>
          {clips.map((c, i) => (
            <div key={i} className="flex items-center gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary truncate">{c.label} · {c.trueReps ?? '?'} reps</div>
                <div className="g-meta">{(c.durationMs / 1000).toFixed(1)}s · {c.samples.length} samples</div>
              </div>
              <button onClick={() => shareFile(`${c.label}-${c.trueReps ?? 'x'}reps-${i}.json`, JSON.stringify(c))}
                className="px-4 h-10 rounded-[15px] bg-bg-2 text-text-primary text-sm font-bold">Send</button>
            </div>
          ))}
        </div>

        {/* report */}
        <div>
          <div className="g-label mb-2">Report</div>
          <div className="flex gap-2">
            <button onClick={copyReport} className="flex-1 h-12 rounded-[15px] bg-accent font-bold text-sm" style={{ color: 'var(--color-on-accent)' }}>Copy report</button>
            <button onClick={() => shareFile(`sensor-report-${Date.now()}.txt`, buildReport())}
              className="flex-1 h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Send report</button>
          </div>
          {note && <p className="g-meta mt-2">{note}</p>}
          <a href="/api/rep-traces/export" download
            className="block mt-2 g-meta underline opacity-70">
            Download every recorded set ({saved} this session)
          </a>
        </div>

        {/* config */}
        {linked && sensor.found?.write && (
          <div>
            <div className="g-label mb-2">Output rate</div>
            <p className="text-[12px] text-text-secondary mb-2" style={{ lineHeight: 1.5 }}>
              Unlock, pick a rate, then save. 50 Hz is the one you want — the factory default is 10 Hz, which is thin for counting reps.
            </p>
            <div className="flex gap-1 flex-wrap">
              <Cmd onClick={() => sensor.send(CMD.unlock)}>unlock</Cmd>
              {RATES.map(([code, name]) => <Cmd key={code} onClick={() => sensor.send(CMD.rate(code))}>{name}</Cmd>)}
              <Cmd onClick={() => sensor.send(CMD.save)}>save</Cmd>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

function Diag({ ok, label, bad, pending }) {
  const colour = pending ? 'var(--color-text-tertiary)' : ok ? 'var(--g-ok)' : 'var(--color-error)';
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span style={{ color: colour }}>{pending ? '·' : ok ? '✓' : '✕'}</span>
      <span className="text-text-secondary">{label}</span>
      {!ok && !pending && bad && <span style={{ color: colour }}>{bad}</span>}
    </div>
  );
}

function Row({ label, a, b, c, extra }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="g-label" style={{ fontSize: 9, width: 58 }}>{label}</span>
      <span className="g-tab flex-1 text-right text-text-primary">{a}</span>
      <span className="g-tab flex-1 text-right text-text-primary">{b}</span>
      <span className="g-tab flex-1 text-right text-text-primary">{c}</span>
      {extra && <span className="g-tab text-text-tertiary" style={{ minWidth: 62, textAlign: 'right' }}>{extra}</span>}
    </div>
  );
}

function Cmd({ onClick, children }) {
  return (
    <button onClick={() => onClick().catch(() => {})}
      className="px-3 h-9 rounded-xl bg-bg-2 text-text-secondary text-[11px] font-bold">
      {children}
    </button>
  );
}

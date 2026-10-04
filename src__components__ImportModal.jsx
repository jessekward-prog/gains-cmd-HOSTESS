import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { overlayVariants, modalVariants } from '../lib/variants';
import useBackHandler from '../hooks/useBackHandler';

// ── Shared image compressor ──────────────────────────────────────────
function compressImage(file, maxWidth = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', dataUrl });
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── CSV tab ──────────────────────────────────────────────────────────
function CSVTab({ onImported }) {
  const [stage, setStage] = useState('idle');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const reset = () => { setStage('idle'); setFile(null); setPreview(null); setResult(null); setErrorMsg(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const parsePreview = useCallback((csvText) => {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const header = lines[0].toLowerCase().replace(/"/g, '');
    const cols = header.split(',').map(c => c.trim());
    const isHevy   = cols.includes('exercise_title') && cols.includes('weight_lbs');
    const isStrong = cols.includes('exercise name') && cols.includes('workout name');
    if (!isHevy && !isStrong) return null;
    const titleCol = isHevy ? 'title' : 'workout name';
    const dateCol  = isHevy ? 'start_time' : 'date';
    const idxMap = {};
    cols.forEach((c, i) => { idxMap[c] = i; });
    const sessions = new Set();
    const dates = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      const title = (vals[idxMap[titleCol]] || '').replace(/"/g, '').trim();
      const date  = (vals[idxMap[dateCol]]  || '').replace(/"/g, '').trim();
      if (title && date) { sessions.add(`${title}||${date}`); dates.push(isHevy ? date.split(',')[0] : date.split(' ')[0]); }
    }
    const sorted = dates.filter(Boolean).sort();
    return { source: isHevy ? 'Hevy' : 'Strong', workouts: sessions.size, sets: lines.length - 1, earliest: sorted[0] || '?', latest: sorted[sorted.length - 1] || '?' };
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const p = parsePreview(ev.target.result);
      if (!p) { setErrorMsg('Unrecognised format. Upload a CSV exported directly from Hevy or Strong.'); setStage('error'); }
      else { setPreview(p); setStage('preview'); }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setStage('importing');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import-workouts', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Import failed');
      setResult(data);
      setStage('done');
      onImported?.();
    } catch (err) { setErrorMsg(err.message); setStage('error'); }
  };

  if (stage === 'idle') return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-text-secondary leading-relaxed">Export your data from Hevy or Strong, then upload the CSV here.</div>
      <div className="bg-bg-3 rounded-xl p-3 flex flex-col gap-1 text-[11px] font-mono text-text-tertiary">
        <div className="text-text-secondary font-semibold mb-0.5">Hevy:</div>
        <div>Profile → ⚙️ → Export &amp; Import → Export Workouts</div>
        <div className="text-text-secondary font-semibold mt-2 mb-0.5">Strong:</div>
        <div>Settings → Export Data → Export as CSV</div>
      </div>
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileInputRef.current?.click()}
        className="w-full py-4 border-2 border-dashed border-border rounded-xl text-sm font-mono text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors">
        📂 Select CSV file
      </motion.button>
    </div>
  );

  if (stage === 'preview' && preview) return (
    <div className="flex flex-col gap-4">
      <div className="bg-bg-2 border border-border rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{preview.source}</span>
          <span className="text-xs text-text-secondary font-mono">detected</span>
        </div>
        {[['Workouts', preview.workouts], ['Sets', preview.sets.toLocaleString()], ['Earliest', preview.earliest], ['Latest', preview.latest]].map(([l, v]) => (
          <div key={l} className="flex justify-between"><span className="text-xs text-text-tertiary font-mono">{l}</span><span className="text-xs font-semibold">{v}</span></div>
        ))}
      </div>
      {preview.source === 'Hevy' && <div className="text-[11px] text-text-tertiary">Weights auto-converted from lbs → kg. Duplicates will be skipped.</div>}
      <div className="flex gap-2">
        <button onClick={reset} className="flex-1 py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Cancel</button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleImport} className="flex-[2] py-3 text-sm font-mono font-semibold bg-accent text-white rounded-xl">Import {preview.workouts} workouts</motion.button>
      </div>
    </div>
  );

  if (stage === 'importing') return (
    <div className="py-8 flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <div className="text-sm font-mono text-text-secondary">Importing...</div>
    </div>
  );

  if (stage === 'done' && result) return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="text-4xl">✓</div>
        <div className="font-display font-bold text-lg text-success">Import complete</div>
      </div>
      <div className="bg-bg-2 border border-border rounded-xl p-4 flex flex-col gap-2">
        {[['Source', result.source], ['Imported', `${result.saved} workout${result.saved !== 1 ? 's' : ''}`], result.skipped > 0 && ['Skipped', `${result.skipped} duplicates`]].filter(Boolean).map(([l, v]) => (
          <div key={l} className="flex justify-between"><span className="text-xs text-text-tertiary font-mono">{l}</span><span className="text-xs font-semibold">{v}</span></div>
        ))}
      </div>
      <button onClick={reset} className="w-full py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Import another</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-error/10 border border-error/30 rounded-xl p-4">
        <div className="text-sm font-mono text-error font-semibold mb-1">Import failed</div>
        <div className="text-[11px] text-text-secondary">{errorMsg}</div>
      </div>
      <button onClick={reset} className="w-full py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Try again</button>
    </div>
  );
}

// ── Screenshot tab ───────────────────────────────────────────────────
function ScreenshotTab({ onImported }) {
  const [stage, setStage] = useState('idle'); // idle | extracting | review | saving | done | error
  const [preview, setPreview] = useState(null);   // { dataUrl }
  const [extracted, setExtracted] = useState(null); // parsed workout from API
  const [workoutDate, setWorkoutDate] = useState(() => {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
  });
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const reset = () => { setStage('idle'); setPreview(null); setExtracted(null); setErrorMsg(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage('extracting');
    try {
      const { base64, mediaType, dataUrl } = await compressImage(file);
      setPreview({ dataUrl });
      const res = await fetch('/api/import-screenshot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, mediaType, workoutDate }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setExtracted(data.extracted);
      if (data.extracted.date) setWorkoutDate(data.extracted.date);
      setStage('review');
    } catch (err) { setErrorMsg(err.message || 'Could not read workout from this image.'); setStage('error'); }
  };

  const handleSave = async () => {
    setStage('saving');
    try {
      const res = await fetch('/api/import-screenshot-save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutName: extracted.workoutName, date: workoutDate, exercises: extracted.exercises }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStage('done');
      onImported?.();
    } catch (err) { setErrorMsg(err.message); setStage('error'); }
  };

  // Helpers to edit extracted data before saving
  const updateExerciseName = (ei, val) => setExtracted(p => ({ ...p, exercises: p.exercises.map((ex, i) => i === ei ? { ...ex, name: val } : ex) }));
  const updateSet = (ei, si, field, val) => setExtracted(p => ({ ...p, exercises: p.exercises.map((ex, i) => i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j === si ? { ...s, [field]: val } : s) }) }));
  const removeSet = (ei, si) => setExtracted(p => ({ ...p, exercises: p.exercises.map((ex, i) => i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) }).filter(ex => ex.sets.length > 0) }));

  if (stage === 'idle') return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-text-secondary leading-relaxed">
        Upload a screenshot of any workout — from any app, a photo of a whiteboard, or a printed program — and your data will be added automatically.
      </div>
      <div>
        <div className="text-[10px] font-mono text-text-tertiary mb-1.5">Workout date</div>
        <input type="date" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)}
          className="w-full bg-bg-0 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileInputRef.current?.click()}
        className="w-full py-4 border-2 border-dashed border-border rounded-xl text-sm font-mono text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors">
        📷 Select screenshot or photo
      </motion.button>
    </div>
  );

  if (stage === 'extracting') return (
    <div className="py-8 flex flex-col items-center gap-3">
      {preview && <img src={preview.dataUrl} alt="preview" className="w-full max-h-40 object-contain rounded-xl opacity-50 mb-2" />}
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <div className="text-sm font-mono text-text-secondary">Reading workout...</div>
      <div className="text-[11px] text-text-tertiary">Extracting exercises and sets</div>
    </div>
  );

  if (stage === 'review' && extracted) return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <input value={extracted.workoutName || ''} onChange={e => setExtracted(p => ({ ...p, workoutName: e.target.value }))}
            className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm font-display font-semibold text-text-primary outline-none focus:border-accent/50"
            placeholder="Workout name" />
        </div>
        <input type="date" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)}
          className="bg-bg-0 border border-border rounded-lg px-2 py-2 text-xs text-text-primary outline-none focus:border-accent/50" />
      </div>

      {/* Extracted exercises — editable */}
      <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
        {extracted.exercises.map((ex, ei) => (
          <div key={ei} className="bg-bg-2 border border-border rounded-xl p-3">
            <input value={ex.name} onChange={e => updateExerciseName(ei, e.target.value)}
              className="w-full bg-transparent text-sm font-display font-semibold text-text-primary outline-none border-b border-border pb-1 mb-2" />
            <div className="flex flex-col gap-1">
              {ex.sets.map((s, si) => (
                <div key={si} className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-text-tertiary w-6 text-center">{si + 1}</span>
                  <input value={s.weight} onChange={e => updateSet(ei, si, 'weight', e.target.value)} placeholder="kg"
                    className="w-14 text-center bg-bg-1 border border-border rounded px-1.5 py-1 text-text-primary outline-none focus:border-accent/40" />
                  <span className="text-text-muted">×</span>
                  <input value={s.reps} onChange={e => updateSet(ei, si, 'reps', e.target.value)} placeholder="reps"
                    className="w-14 text-center bg-bg-1 border border-border rounded px-1.5 py-1 text-text-primary outline-none focus:border-accent/40" />
                  <button onClick={() => removeSet(ei, si)} className="ml-auto text-error/50 hover:text-error text-[10px]">✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-text-tertiary">Review and edit above before saving. Tap any field to correct it.</div>

      <div className="flex gap-2">
        <button onClick={reset} className="flex-1 py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Discard</button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave}
          className="flex-[2] py-3 text-sm font-mono font-semibold bg-accent text-white rounded-xl">
          Save workout
        </motion.button>
      </div>
    </div>
  );

  if (stage === 'saving') return (
    <div className="py-8 flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <div className="text-sm font-mono text-text-secondary">Saving...</div>
    </div>
  );

  if (stage === 'done') return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-4xl">✓</div>
      <div className="font-display font-bold text-lg text-success">Workout saved</div>
      <div className="text-xs text-text-tertiary text-center">Check your History tab to see it.</div>
      <button onClick={reset} className="w-full py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Import another</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-error/10 border border-error/30 rounded-xl p-4">
        <div className="text-sm font-mono text-error font-semibold mb-1">Could not read image</div>
        <div className="text-[11px] text-text-secondary">{errorMsg}</div>
      </div>
      <div className="text-[11px] text-text-tertiary">Try a clearer screenshot with the exercise names and numbers visible.</div>
      <button onClick={reset} className="w-full py-3 text-sm font-mono text-text-secondary border border-border rounded-xl">Try again</button>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────
export default function ImportModal({ open, onClose, onImported }) {
  const [activeTab, setActiveTab] = useState('screenshot');

  const handleClose = () => { onClose(); };

  // Android back gesture dismisses.
  useBackHandler(open, handleClose);

  return (
    <AnimatePresence>
      {open && (
        <motion.div variants={overlayVariants} initial="initial" animate="animate" exit="exit"
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          onClick={handleClose}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div variants={modalVariants} initial="initial" animate="animate" exit="exit"
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-bg-1 border border-border-strong rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="font-display font-semibold text-base text-text-primary">Import Workout Data</div>
              <button onClick={handleClose} className="text-text-tertiary text-xl leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
              {[['screenshot', '📷 Screenshot'], ['csv', '📂 CSV File']].map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex-1 py-2.5 text-xs font-mono transition-colors ${
                    activeTab === id ? 'text-accent border-b-2 border-accent' : 'text-text-tertiary hover:text-text-secondary'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1">
              {activeTab === 'screenshot' && <ScreenshotTab onImported={onImported} />}
              {activeTab === 'csv'        && <CSVTab onImported={onImported} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

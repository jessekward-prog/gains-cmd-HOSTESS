import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEMES, ACCENT_COLORS, FONTS } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHeaderMessage } from '../context/HeaderMessageContext';
import ImportModal from '../components/ImportModal';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { workoutLayout as readLayout } from '../lib/focus';
import { WAVE_KEY, readWaveStyle } from '../components/WaveBackground';
import { moodState } from '../lib/mood';

const MONO = 'var(--font-mono)';
// Settings preview chips: each shows that mood for 2.8s.
const MOOD_CHIPS = [
  ['work', 'Lifting', 'var(--color-accent)'], ['rest', 'Rest', 'var(--color-error)'], ['done', 'Set done', 'var(--color-success)'],
  ['intW', 'Interval on', 'var(--color-success)'], ['pr', 'PR', '#fbbf24'], ['intR', 'Interval off', '#f59e0b'],
];
const LAYOUTS = [
  { id: 'focus', name: 'Focus', desc: 'Default · one set at a time' },
  { id: 'dense', name: 'Dense', desc: 'Classic-style · all sets listed' },
  { id: 'classic', name: 'Classic', desc: 'Stacked cards' },
  { id: 'block-grid', name: 'Block Grid', desc: '2-column blocks' },
];


export default function SettingsPage() {
  const { logout } = useAuth();
  const { themeId, setTheme, currentTheme, accentColorId, setAccent, accentColors, accentIntensity, setIntensity, uiScale, setScale, fontId, setFont, textSizeId, setTextSize, bannerEnabled, setBannerEnabled, bannerText, setBannerText } = useTheme();
  const { showToast } = useToast();
  const { showHeaderMessage } = useHeaderMessage();

  const [showImport, setShowImport] = useState(false);
  const { canInstall, isInstalled, install } = usePWAInstall();

  // Workout layout preferences (localStorage only — purely UI)
  const [workoutLayout, setWorkoutLayout] = useState(readLayout);
  const [expandMode, setExpandMode] = useState(() => {
    try { return localStorage.getItem('gains-cmd-expand-mode') || 'inline'; } catch { return 'inline'; }
  });

  const handleSetLayout = useCallback((val) => {
    setWorkoutLayout(val);
    try { localStorage.setItem('gains-cmd-workout-layout', val); } catch {}
    showToast(`${LAYOUTS.find((l) => l.id === val)?.name} layout`, 'success');
  }, [showToast]);

  const handleSetExpandMode = useCallback((val) => {
    setExpandMode(val);
    try { localStorage.setItem('gains-cmd-expand-mode', val); } catch {}
    showToast(`Expand mode: ${val}`, 'success');
  }, [showToast]);

  const [waves, setWaves] = useState(readWaveStyle);
  const pickWaves = (v) => {
    setWaves(v);
    try { localStorage.setItem(WAVE_KEY, v); } catch {}
    window.dispatchEvent(new Event('gains-waves'));
  };

  const darkThemes = THEMES.filter(t => t.mode === 'dark');
  const lightThemes = THEMES.filter(t => t.mode === 'light');
  const pickTheme = (t) => { setTheme(t.id); showHeaderMessage(t.name + ' applied'); };

  return (
    <div className="g-root px-4 pt-2.5 pb-7 fx-rise">
      <h1 className="mx-1 mt-3 mb-0.5 g-h1">Settings</h1>

      <div className="mt-4 flex flex-col gap-2">
        <Section title="Workout layout">
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map((l) => (
              <Tile key={l.id} active={workoutLayout === l.id} onClick={() => handleSetLayout(l.id)}>
                <span className="text-[15px] font-extrabold">{l.name}</span>
                <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{l.desc}</span>
              </Tile>
            ))}
          </div>
          {workoutLayout === 'block-grid' && (
            <>
              <p className="text-xs text-text-secondary mt-3 mb-2">How should a block open when you tap it?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'inline', label: 'Inline', desc: 'Expands in place' },
                  { id: 'drawer', label: 'Drawer', desc: 'Slides up from bottom' },
                  { id: 'takeover', label: 'Takeover', desc: 'Full screen focus' },
                  { id: 'modal', label: 'Modal', desc: 'Popup overlay' },
                ].map(opt => (
                  <Tile key={opt.id} active={expandMode === opt.id} onClick={() => handleSetExpandMode(opt.id)}>
                    <span className="text-[13px] font-bold">{opt.label}</span>
                    <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{opt.desc}</span>
                  </Tile>
                ))}
              </div>
            </>
          )}
        </Section>

        <Section title="Theme">
          <div className="g-label mb-2" style={{ fontSize: 9 }}>DARK</div>
          <div className="grid grid-cols-2 gap-2">
            {darkThemes.map(t => <ThemeTile key={t.id} theme={t} active={themeId === t.id} onSelect={() => pickTheme(t)} />)}
          </div>
          <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>LIGHT</div>
          <div className="grid grid-cols-2 gap-2">
            {lightThemes.map(t => <ThemeTile key={t.id} theme={t} active={themeId === t.id} onSelect={() => pickTheme(t)} />)}
          </div>
        </Section>

        <Section title="Live background">
          <div className="grid grid-cols-2 gap-2">
            {[['xmb', 'Waves', 'Flowing ribbons, colour follows the set'], ['off', 'Off', 'Static']].map(([id, name, desc]) => (
              <Tile key={id} active={waves === id} onClick={() => pickWaves(id)}>
                <span className="text-sm font-extrabold">{name}</span>
                <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}`, lineHeight: 1.35 }}>{desc}</span>
              </Tile>
            ))}
          </div>
          {waves !== 'off' && (
            <>
              <div className="g-label mt-3.5">PREVIEW MOOD</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {MOOD_CHIPS.map(([m, label, dot]) => (
                  <button key={m} onClick={() => { moodState.preview = { m, t: Date.now() }; }}
                    className="flex items-center gap-1.5 h-[34px] px-3 rounded-[12px] bg-bg-2 text-text-primary active:bg-bg-3"
                    style={{ font: `500 11px ${MONO}` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: dot }} />{label}
                  </button>
                ))}
              </div>
            </>
          )}
        </Section>

        <Section title="Text size">
          <Segmented value={textSizeId} onChange={setTextSize} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} />
        </Section>

        <Section title="UI size">
          <Segmented value={uiScale} onChange={setScale} options={[[14, 'Small'], [16, 'Medium'], [18, 'Large']]} />
        </Section>

        <Section title="Accent colour">
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => setAccent(null)}
              className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[9px] text-white"
              style={{ background: currentTheme.preview.accent, fontFamily: MONO, boxShadow: !accentColorId ? '0 0 0 2px var(--color-bg-1), 0 0 0 3.5px var(--color-text-primary)' : 'none' }}>
              Auto
            </button>
            {accentColors.map(c => (
              <button key={c.id} onClick={() => setAccent(c.id)} aria-label={c.id} className="w-10 h-10 rounded-[12px]"
                style={{ background: c.hex, boxShadow: accentColorId === c.id ? '0 0 0 2px var(--color-bg-1), 0 0 0 3.5px var(--color-text-primary)' : 'none' }} />
            ))}
          </div>
          <Segmented value={accentIntensity} onChange={setIntensity} options={[[25, 'Subtle'], [50, 'Mild'], [75, 'Bold'], [100, 'Max']]} />
        </Section>

        <Section title="Font">
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map(f => (
              <Tile key={f.id} active={fontId === f.id} onClick={() => setFont(f.id)}>
                <span className="text-[13px] font-bold" style={{ fontFamily: f.display }}>{f.name}</span>
                <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{f.desc}</span>
              </Tile>
            ))}
          </div>
        </Section>

        <Section title="Boot splash">
          <Segmented value={bannerEnabled} onChange={setBannerEnabled} options={[[true, 'Image Banner'], [false, 'Text Only']]} />
          {!bannerEnabled && (
            <input type="text" value={bannerText} onChange={(e) => setBannerText(e.target.value)} placeholder="Gains_CMD" maxLength={40}
              className="mt-2 w-full h-12 px-4 rounded-[15px] bg-bg-2 text-text-primary text-sm outline-none focus:ring-1 focus:ring-accent/40" />
          )}
        </Section>

        {!isInstalled && canInstall && (
          <Section title="Install app">
            <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
              Install Gains_CMD to your home screen — no browser bar, faster load, works offline.
            </p>
            <button onClick={install} className="w-full h-12 rounded-[15px] bg-accent font-bold text-sm" style={{ color: 'var(--color-on-accent)' }}>Install Gains_CMD</button>
          </Section>
        )}

        <Section title="Data">
          <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
            Import history from another app, or scan a screenshot to create a workout entry.
          </p>
          <button onClick={() => setShowImport(true)} className="w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Import from Hevy / Strong / Screenshot</button>
        </Section>
      </div>

      <button onClick={logout} className="mt-4 w-full h-12 rounded-[15px] text-error font-bold text-sm">Lock app</button>
      <p className="mt-1.5 text-center text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>v2.3.0</p>

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {
          showToast('Import complete! Check your History tab.', 'success');
          showHeaderMessage('Import complete');
        }}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-bg-1 rounded-[24px] p-4">
      <h2 className="g-label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className="flex flex-col gap-1 items-start p-3.5 rounded-2xl text-left text-text-primary active:scale-[.97] transition-transform"
      style={{ background: active ? 'var(--g-acc-soft)' : 'var(--color-bg-2)', boxShadow: active ? 'inset 0 0 0 1.5px var(--color-accent)' : 'none' }}>
      {children}
    </button>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-bg-2">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className="flex-1 h-[38px] rounded-[12px] font-bold text-[13px] transition-colors"
          style={{ background: value === v ? 'var(--color-bg-0)' : 'transparent', color: value === v ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ThemeTile({ theme, active, onSelect }) {
  const p = theme.preview;
  const sw = (bg, ring) => <span className="w-[18px] h-[18px] rounded-[6px]" style={{ background: bg, boxShadow: ring ? 'inset 0 0 0 1px rgba(128,128,128,.3)' : 'none' }} />;
  return (
    <button onClick={onSelect}
      className="flex flex-col gap-2 items-start p-3 rounded-2xl bg-bg-2 text-left active:scale-[.97] transition-transform"
      style={{ boxShadow: active ? 'inset 0 0 0 1.5px var(--color-accent)' : 'none' }}>
      <span className="flex gap-1">{sw(p.bg, true)}{sw(p.surface)}{sw(p.accent)}</span>
      <span className="text-[13px] font-bold text-text-primary">{theme.name}</span>
    </button>
  );
}

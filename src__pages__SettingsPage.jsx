import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEMES, ACCENT_COLORS, FONTS, loadFontPreviews } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHeaderMessage } from '../context/HeaderMessageContext';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';
import SensorProbe from '../components/SensorProbe';
import ExerciseInfo from '../components/ExerciseInfo';
import QuestHeroCard from '../components/QuestHeroCard';
import { SKINS, isSkin, skinById, swatchesOf } from '../lib/questSkins';
import useQuest, { QUEST_TINT_KEY, QUEST_SCAN_KEY, QUEST_SCROLL_KEY, readTint, readScanlines, readScrolls, QUEST_FX, questFxKey, readQuestFx } from '../hooks/useQuest';
import { TINTS, lvTitle, THEME_NAMES, heroesOf, defaultHeroOf } from '../lib/quest';
import { exerciseNames } from '../components/ExerciseNameOptions';
import { useWorkout } from '../context/WorkoutContext';
import useCatalog from '../hooks/useCatalog';
import { resolve, candidates, titleCase } from '../lib/catalog';
import * as api from '../lib/api';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sensorSupported } from '../hooks/useRepSensor';
import { workoutLayout as readLayout } from '../lib/focus';
import { WAVE_KEY, readWaveStyle } from '../components/WaveBackground';
import { moodState } from '../lib/mood';
import { GREETING_KEY, readGreeting, defaultGreeting } from '../lib/greeting';
import { native } from '../lib/native';
import { readRemind, saveRemind } from '../lib/upnext';
import { useScreenFit, MIN_W, toggleDeskLayout } from '../lib/fit';

const MONO = 'var(--font-mono)';
// Settings preview chips: each shows that mood for 2.8s.
const MOOD_CHIPS = [
  ['work', 'Lifting', 'var(--color-accent)'], ['rest', 'Rest', 'var(--color-error)'], ['done', 'Set done', 'var(--color-success)'],
  ['intW', 'Interval on', 'var(--color-success)'], ['pr', 'PR', '#fbbf24'], ['intR', 'Interval off', '#f59e0b'],
];
const LAYOUTS = [
  { id: 'classic', name: 'List', desc: 'Default · every exercise, swipe through sets' },
  { id: 'focus', name: 'Focus', desc: 'One set at a time' },
  { id: 'dense', name: 'Dense', desc: 'Classic-style · all sets listed' },
  { id: 'block-grid', name: 'Block Grid', desc: '2-column blocks' },
];


export default function SettingsPage() {
  const { logout, user } = useAuth();
  const { themeId, setTheme, crt, setCrt, roll, setRoll, vignette, setVignette, currentTheme, accentColorId, setAccent, accentColors, accentIntensity, setIntensity, uiScale, setScale, fontId, setFont, textSizeId, setTextSize, bannerEnabled, setBannerEnabled } = useTheme();
  const { showToast } = useToast();
  const { showHeaderMessage } = useHeaderMessage();

  const [showImport, setShowImport] = useState(false);
  const [showProbe, setShowProbe] = useState(false);
  const { canInstall, isInstalled, install } = usePWAInstall();

  // Workout layout preferences (localStorage only — purely UI)
  const [workoutLayout, setWorkoutLayout] = useState(readLayout);
  const [expandMode, setExpandMode] = useState(() => {
    try { return localStorage.getItem('gains-beta-expand-mode') || 'inline'; } catch { return 'inline'; }
  });

  const handleSetLayout = useCallback((val) => {
    setWorkoutLayout(val);
    try { localStorage.setItem('gains-beta-workout-layout', val); } catch {}
    showToast(`${LAYOUTS.find((l) => l.id === val)?.name} layout`, 'success');
  }, [showToast]);

  const handleSetExpandMode = useCallback((val) => {
    setExpandMode(val);
    try { localStorage.setItem('gains-beta-expand-mode', val); } catch {}
    showToast(`Expand mode: ${val}`, 'success');
  }, [showToast]);

  const [greeting, setGreeting] = useState(readGreeting);
  const saveGreeting = (v) => {
    setGreeting(v);
    try { if (v.trim()) localStorage.setItem(GREETING_KEY, v); else localStorage.removeItem(GREETING_KEY); } catch {}
  };

  const [waves, setWaves] = useState(readWaveStyle);
  const pickWaves = (v) => {
    setWaves(v);
    try { localStorage.setItem(WAVE_KEY, v); } catch {}
    window.dispatchEvent(new Event('gains-waves'));
  };

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

        <Section title="Quest">
          <Collapse label="QUEST" summary="Look · reskin · scene · animations">
            <p className="mb-1 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>Pick Quest instead of Workout on the home screen to play a session as a pixel monster battler.</p>
            <QuestSettings />
          </Collapse>
        </Section>

        <Section title="Theme">
          <div className="flex flex-col gap-2">
            <ThemePicker value={themeId} onPick={(id) => pickTheme(THEMES.find((t) => t.id === id))} />
            <AccentPicker value={accentColorId} onPick={setAccent} intensity={accentIntensity} setIntensity={setIntensity} auto={currentTheme.preview.accent} />
            <Collapse label="FONT" onOpen={loadFontPreviews} summary={<span style={{ fontFamily: FONTS.find((f) => f.id === fontId)?.display }}>{FONTS.find((f) => f.id === fontId)?.name || 'Default'}</span>}>
              <div className="grid grid-cols-2 gap-2">
                {FONTS.map(f => (
                  <Tile key={f.id} active={fontId === f.id} onClick={() => setFont(f.id)}>
                    <span className="text-[13px] font-bold" style={{ fontFamily: f.display }}>{f.name}</span>
                    <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{f.desc}</span>
                  </Tile>
                ))}
              </div>
            </Collapse>
            <Collapse label="BACKGROUND" summary={waves === 'off' ? 'Off' : 'Waves'}>
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
            </Collapse>
          </div>
        </Section>

        <Section title="Visual effects">
          <div>
            <p className="mb-3 text-[12px] text-text-secondary" style={{ lineHeight: 1.5 }}>Laid over the whole app, on any theme.</p>
            <div className="g-label mb-2" style={{ fontSize: 9 }}>CRT OVERLAY</div>
            <Segmented value={crt} onChange={setCrt} options={CRT_LEVELS} />
            <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>VIGNETTE</div>
            <Segmented value={vignette} onChange={setVignette} options={[['off', 'Off'], ['subtle', 'Subtle'], ['soft', 'Soft'], ['full', 'Strong']]} />
            <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>SCAN LINE</div>
            <Segmented value={roll} onChange={setRoll} options={[['on', 'On'], ['off', 'Off']]} />
          </div>
        </Section>

        <Section title="Display">
          <Collapse label="DISPLAY" summary={`Text ${{ small: 'S', medium: 'M', large: 'L' }[textSizeId]} · UI ${{ 14: 'S', 16: 'M', 18: 'L' }[uiScale]}`}>
            <div className="g-label mb-2" style={{ fontSize: 9 }}>TEXT SIZE</div>
            <Segmented value={textSizeId} onChange={setTextSize} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} />
            <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>UI SIZE</div>
            <Segmented value={uiScale} onChange={setScale} options={[[14, 'Small'], [16, 'Medium'], [18, 'Large']]} />
            <ScreenFit />
          </Collapse>
        </Section>

        <Section title="Home screen">
          <div className="g-label mb-2" style={{ fontSize: 9 }}>GREETING</div>
          <input type="text" value={greeting} onChange={(e) => saveGreeting(e.target.value)} maxLength={40}
            placeholder={defaultGreeting(user)} aria-label="Greeting on the Programs screen"
            className="w-full h-12 px-4 rounded-[15px] bg-bg-2 text-text-primary text-sm outline-none focus:ring-1 focus:ring-accent/40" />
          <p className="mt-1.5 text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>Leave empty for “{defaultGreeting(user)}”.</p>
          <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>SPLASH ON OPEN</div>
          <Segmented value={bannerEnabled} onChange={setBannerEnabled} options={[[true, 'On'], [false, 'Off']]} />
        </Section>

        <AndroidSection />

        {!isInstalled && canInstall && (
          <Section title="Install app">
            <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
              Install Gains_CMD to your home screen — no browser bar, faster load, works offline.
            </p>
            <button onClick={install} className="w-full h-12 rounded-[15px] bg-accent font-bold text-sm" style={{ color: 'var(--color-on-accent)' }}>Install Gains_CMD</button>
          </Section>
        )}

        <LibrarySection />

        <Section title="Desktop layout">
          <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
            A big-screen planner for programs, history, progress, exercises and Auto weight rules. Opens automatically in desktop view; switch here on any device, and back with “Phone layout” in its sidebar.
          </p>
          <button type="button" onClick={() => toggleDeskLayout(true)} className="w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Switch to desktop layout</button>
        </Section>

        {sensorSupported() && (
          <Section title="Rep sensor">
            <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
              Link the WitMotion sensor over Bluetooth, prove the decode with three poses, then record clips to build the rep counter against. Nothing here touches your workouts yet.
            </p>
            <button onClick={() => setShowProbe(true)} className="w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Open sensor probe</button>
          </Section>
        )}

        <Section title="Data">
          <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
            Import history from another app, or scan a screenshot to create a workout entry.
          </p>
          <button onClick={() => setShowImport(true)} className="w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">Import from Hevy / Strong / Screenshot</button>
        </Section>
      </div>

      <button onClick={logout} className="mt-4 w-full h-12 rounded-[15px] text-error font-bold text-sm">Log out</button>
      <p className="mt-1.5 text-center text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>v2.3.0</p>

      <SensorProbe open={showProbe} onClose={() => setShowProbe(false)} />

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

// Only inside the Android app (lib/native.js).
function AndroidSection() {
  const [, redraw] = useState(0);
  const [remind, setRemind] = useState(readRemind);
  useEffect(() => {
    const draw = () => redraw((n) => n + 1);
    const offs = [native.onReady(draw), native.subscribe((m) => { if (m.t === 'can-ring') draw(); })];
    return () => offs.forEach((f) => f());
  }, []);
  if (!native.on) return null;
  const save = (r) => {
    setRemind(r);
    saveRemind(r);
    native.send({ t: 'remind', ...r, ask: true });
  };
  return (
    <Section title="Android app">
      <div className="g-label mb-2" style={{ fontSize: 9 }}>REMIND ME AFTER DAYS WITHOUT A WORKOUT</div>
      <Segmented value={remind.days} onChange={(days) => save({ ...remind, days })} options={[[0, 'Off'], [1, '1'], [2, '2'], [3, '3'], [4, '4']]} />
      {remind.days > 0 && (
        <>
          <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>AT</div>
          <input type="time" value={remind.at} onChange={(e) => e.target.value && save({ ...remind, at: e.target.value })} aria-label="Reminder time"
            className="w-full h-12 px-4 rounded-[15px] bg-bg-2 text-text-primary text-sm outline-none focus:ring-1 focus:ring-accent/40" />
        </>
      )}
      <p className="mt-2 text-text-tertiary" style={{ font: `400 10px/1.5 ${MONO}` }}>
        {remind.days > 0 && native.blocked ? 'Android is blocking notifications from Gains. Turn them on in Android settings. ' : ''}
        For the widget, hold an empty spot on your home screen, then Widgets, Gains_CMD.
      </p>
    </Section>
  );
}

// Match the user's exercise names to the library (animations + muscle map).
// Names that are already a library spelling match themselves; the rest go to
// the local model ten at a time, sequentially (LM Studio serves one at a time),
// choosing only from a shortlist. Every match stays reviewable and changeable.
function LibrarySection() {
  const { workoutHistory, programs, settings, saveExerciseLinks } = useWorkout();
  const { showToast } = useToast();
  const cat = useCatalog();
  const [busy, setBusy] = useState(null);
  const [review, setReview] = useState(false);
  const [info, setInfo] = useState(null);
  const links = settings?.exerciseLinks || {};
  const names = exerciseNames(workoutHistory, programs);
  if (!cat) return null;
  const matched = names.filter((n) => resolve(n, links, cat));
  const open = names.filter((n) => !(n in links) && !resolve(n, links, cat));

  const matchWithAI = async () => {
    try {
      for (let i = 0; i < open.length; i += 10) {
        setBusy(`Matching ${i}/${open.length}…`);
        const items = open.slice(i, i + 10).map((name) => ({
          name, candidates: candidates(name, cat, 8).map(({ id, n, eq }) => ({ id, n, eq })),
        }));
        const r = await api.suggestExerciseLinks(items);
        await saveExerciseLinks(r.links);
      }
      setReview(true);
      showToast('Matched — check the list below', 'success');
    } catch (e) {
      showToast('AI matching stopped: ' + e.message, 'error');
    }
    setBusy(null);
  };

  return (
    <Section title="Exercise library">
      <p className="mt-2.5 mb-3 text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
        {matched.length} of {names.length} of your exercises are matched to the library, which gives them an animation, steps and a place on the muscle map. Your exercise names never change.
      </p>
      {open.length > 0 && (
        <button onClick={matchWithAI} disabled={!!busy} className="w-full h-12 rounded-[15px] bg-accent font-bold text-sm disabled:opacity-60" style={{ color: 'var(--color-on-accent)' }}>
          {busy || `Match ${open.length} with AI`}
        </button>
      )}
      {names.length > 0 && (
        <button onClick={() => setReview((v) => !v)} className="mt-2 w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">
          {review ? 'Hide matches' : 'Review matches'}
        </button>
      )}
      {review && (
        <div className="mt-2 flex flex-col">
          {names.map((n) => {
            const x = resolve(n, links, cat);
            return (
              <button key={n} onClick={() => setInfo(n)} className="flex justify-between gap-3 py-2.5 border-b border-border text-left last:border-0">
                <span className="text-[13px] font-semibold min-w-0 truncate">{n}</span>
                <span className="text-right min-w-0 truncate" style={{ font: `400 11px ${MONO}`, color: x ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
                  {x ? titleCase(x.n) : n in links ? 'not in library' : '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ExerciseInfo open={!!info} onClose={() => setInfo(null)} name={info} />
    </Section>
  );
}

// Quest Mode look (scene tint, scanlines) and a way into the Hero Card / Vault.
// Each quest animation on its own switch, so the ones that don't flow can go.
function QuestAnimations() {
  const [fx, setFx] = useState(readQuestFx);
  const flip = (id) => {
    const on = !fx[id];
    try { localStorage.setItem(questFxKey(id), on ? 'on' : 'off'); } catch { /* private mode */ }
    setFx((f) => ({ ...f, [id]: on }));
  };
  const count = QUEST_FX.filter(([id]) => fx[id]).length;
  return (
    <Collapse label="ANIMATIONS" summary={`${count} of ${QUEST_FX.length} on`}>
      <div className="flex flex-col gap-1.5">
        {QUEST_FX.map(([id, name, desc]) => (
          <button key={id} onClick={() => flip(id)} role="switch" aria-checked={fx[id]}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-bg-2 text-left">
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-bold text-text-primary">{name}</span>
              <span className="block text-text-tertiary" style={{ font: `400 10px/1.4 ${MONO}` }}>{desc}</span>
            </span>
            <span className="flex-shrink-0 w-10 h-6 rounded-full relative transition-colors" style={{ background: fx[id] ? 'var(--color-accent)' : 'var(--color-bg-3)' }}>
              <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: fx[id] ? 20 : 4 }} />
            </span>
          </button>
        ))}
      </div>
    </Collapse>
  );
}

// A row that shows its current value and opens to its options.
// One line showing the current choice; the options open in a popup so the page never grows.
// What the app measured this screen as, and what it did about it (lib/fit).
function ScreenFit() {
  const { deviceW, deviceH, scale } = useScreenFit();
  if (!deviceW) return null;
  return (
    <>
      <div className="g-label mt-4 mb-2" style={{ fontSize: 9 }}>SCREEN</div>
      <p className="text-text-tertiary" style={{ font: `400 11px/1.5 ${MONO}` }}>
        {deviceW} × {deviceH} · {scale < 1
          ? `narrower than ${MIN_W}, so the app is drawn at ${MIN_W} wide and shown at ${Math.round(scale * 100)}%`
          : 'the app is drawn at full size'}. It refits itself when you rotate, fold or unfold.
      </p>
    </>
  );
}

function Collapse({ label, summary, children, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => { onOpen?.(); setOpen(true); }} className="w-full flex items-center gap-3 px-3.5 h-[52px] rounded-2xl bg-bg-2 text-left">
        <span className="g-label flex-shrink-0" style={{ fontSize: 9 }}>{label}</span>
        <span className="flex-1 min-w-0 flex items-center justify-end gap-2 text-[13px] font-bold text-text-primary truncate">{summary}</span>
        <span className="text-text-tertiary inline-block flex-shrink-0" style={{ font: `500 14px ${MONO}` }}>›</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label.charAt(0) + label.slice(1).toLowerCase()}>
        <div className="g-root p-4">{children}</div>
      </Modal>
    </div>
  );
}

const swatches = (p) => (
  <span className="flex gap-1 flex-shrink-0">
    {[p.bg, p.surface, p.accent].map((c, i) => <span key={i} className="w-3 h-3 rounded-[4px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.3)' }} />)}
  </span>
);

// Theme choice, collapsed to the current one. `withApp` adds "Same as app" and
// the Quest skins — whole looks for the quest screens, stage included.
function ThemePicker({ value, onPick, withApp }) {
  const cur = THEMES.find((t) => t.id === value);
  const skin = isSkin(value) ? skinById(value) : null;
  const grid = (list) => (
    <div className="grid grid-cols-2 gap-2">
      {list.map((t) => <ThemeTile key={t.id} theme={t} active={value === t.id} onSelect={() => onPick(t.id)} />)}
    </div>
  );
  return (
    <Collapse label="THEME" summary={skin ? <>{skin.name}{swatches4(swatchesOf(skin))}</> : cur ? <>{cur.name}{swatches(cur.preview)}</> : 'Same as app'}>
      {withApp && (
        <>
          <div className="g-label mb-2" style={{ fontSize: 9 }}>QUEST SKINS</div>
          <div className="flex flex-col gap-2 mb-3">
            {SKINS.map((sk) => <SkinRow key={sk.id} skin={sk} active={value === sk.id} onSelect={() => onPick(sk.id)} />)}
          </div>
          <div className="g-label mb-2" style={{ fontSize: 9 }}>APP THEMES</div>
        </>
      )}
      {withApp && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Tile active={value === 'app'} onClick={() => onPick('app')}>
            <span className="text-[13px] font-bold">Same as app</span>
            <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>Your theme above</span>
          </Tile>
        </div>
      )}
      <div className="g-label mb-2" style={{ fontSize: 9 }}>DARK</div>
      {grid(THEMES.filter((t) => t.mode === 'dark'))}
      <div className="g-label mt-3 mb-2" style={{ fontSize: 9 }}>LIGHT</div>
      {grid(THEMES.filter((t) => t.mode === 'light'))}
    </Collapse>
  );
}

const CRT_LEVELS = [['off', 'Off'], ['subtle', 'Subtle'], ['soft', 'Soft'], ['full', 'Full']];

// Accent colour + strength, collapsed. "Auto" = the theme's own accent.
function AccentPicker({ value, onPick, intensity, setIntensity, auto }) {
  const hex = ACCENT_COLORS.find((c) => c.id === value)?.hex;
  return (
    <Collapse label="ACCENT" summary={value ? <><span className="w-3 h-3 rounded-[4px]" style={{ background: hex }} />{intensity}%</> : 'Auto'}>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => onPick(null)}
          className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[9px] text-white"
          style={{ background: auto, fontFamily: MONO, boxShadow: !value ? '0 0 0 2px var(--color-bg-1), 0 0 0 3.5px var(--color-text-primary)' : 'none' }}>
          Auto
        </button>
        {ACCENT_COLORS.map((c) => (
          <button key={c.id} onClick={() => onPick(c.id)} aria-label={c.id} className="w-10 h-10 rounded-[12px]"
            style={{ background: c.hex, boxShadow: value === c.id ? '0 0 0 2px var(--color-bg-1), 0 0 0 3.5px var(--color-text-primary)' : 'none' }} />
        ))}
      </div>
      <Segmented value={intensity} onChange={setIntensity} options={[[25, 'Subtle'], [50, 'Mild'], [75, 'Bold'], [100, 'Max']]} />
    </Collapse>
  );
}

// CRT scanlines (+ the vignette that follows them) and the rolling scan line, for Quest's own look.
function ScreenEffects({ crt, setCrt, roll, setRoll }) {
  const crtName = CRT_LEVELS.find(([v]) => v === crt)?.[1] || 'Off';
  return (
    <Collapse label="SCREEN EFFECTS" summary={`CRT ${crtName.toLowerCase()} · scan line ${roll === 'on' ? 'on' : 'off'}`}>
      <div className="g-label mb-2" style={{ fontSize: 9 }}>CRT EFFECT</div>
      <Segmented value={crt} onChange={setCrt} options={CRT_LEVELS} />
      <div className="g-label mt-3 mb-2" style={{ fontSize: 9 }}>SCAN LINE</div>
      <Segmented value={roll} onChange={setRoll} options={[['on', 'On'], ['off', 'Off']]} />
    </Collapse>
  );
}

function QuestSettings() {
  const { prof, updProf } = useQuest();
  // Switch the whole quest reskin. The hero resets to that theme's default if
  // the current one doesn't exist in the new theme's roster.
  const pickTheme = (next) => updProf((p) => ({ ...p, theme: next, hero: heroesOf(next)[p.hero] ? p.hero : defaultHeroOf(next) }));
  const { themeId, questTheme, setQuestTheme, questCrt, setQuestCrt, questRoll, setQuestRoll, questAccent, setQuestAccent, questIntensity, setQuestIntensity } = useTheme();
  const skin = isSkin(questTheme) ? skinById(questTheme) : null;
  const qTheme = THEMES.find((t) => t.id === (questTheme === 'app' ? themeId : questTheme)) || THEMES[0];
  const [tint, setTint] = useState(readTint);
  const [scan, setScan] = useState(readScanlines);
  const [scrolls, setScrolls] = useState(readScrolls);
  const [card, setCard] = useState(false);
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  return (
    <div className="mt-4">
      <div className="g-label mb-2" style={{ fontSize: 9 }}>LOOK · ONLY ON THE QUEST SCREENS</div>
      <div className="flex flex-col gap-2">
        <ThemePicker value={questTheme} onPick={setQuestTheme} withApp />
        {/* A skin brings its own accent and its own sprite colours, so the two
            pickers that would fight it step aside while one is on. */}
        {!skin && <AccentPicker value={questAccent} onPick={setQuestAccent} intensity={questIntensity} setIntensity={setQuestIntensity} auto={qTheme.preview.accent} />}
        <ScreenEffects crt={questCrt} setCrt={setQuestCrt} roll={questRoll} setRoll={setQuestRoll} />
      </div>
      {skin && <p className="mt-2 text-xs text-text-secondary" style={{ lineHeight: 1.5 }}>{skin.name} sets its own accent and sprite colours. Pick an app theme above to get the accent and scene pickers back.</p>}
      <div className="flex flex-col gap-2 mt-2">
        <Collapse label="RESKIN" summary={`${THEME_NAMES[prof.theme] || 'Fantasy'} · lands, hero and monsters`}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(THEME_NAMES).map(([id, name]) => (
              <Tile key={id} active={(prof.theme || 'fantasy') === id} onClick={() => pickTheme(id)}>
                <span className="flex items-center gap-2 text-[14px] font-extrabold">
                  <span className="w-3 h-3 rounded-full" style={{ background: id === 'cyberpunk' ? '#ff5ea8' : '#c08457' }} />{name}
                </span>
              </Tile>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-secondary" style={{ lineHeight: 1.5 }}>Fantasy is the original look. Cyberpunk reskins the lands, hero, monsters and bosses — same gameplay. Switching will swap your hero to one that fits the new theme.</p>
        </Collapse>
        <Collapse label="SCENE" summary={skin ? `${skin.name} · scanlines ${scan ? 'on' : 'off'}` : `${TINTS[tint]?.[0] || tint} · scanlines ${scan ? 'on' : 'off'}`}>
          {skin ? (
            <p className="mb-3 text-xs text-text-secondary" style={{ lineHeight: 1.5 }}>{skin.name} colours the sprites itself, so the tint below is off while it's on.</p>
          ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TINTS).map(([k, [name, hex]]) => (
              <Tile key={k} active={tint === k} onClick={() => { setTint(k); save(QUEST_TINT_KEY, k); }}>
                <span className="flex items-center gap-2 text-[14px] font-extrabold"><span className="w-3 h-3 rounded-full" style={{ background: hex }} />{name}</span>
              </Tile>
            ))}
          </div>
          )}
          <div className="g-label mt-3 mb-2" style={{ fontSize: 9 }}>SCANLINES ON THE SCENE ART</div>
          <Segmented value={scan} onChange={(v) => { setScan(v); save(QUEST_SCAN_KEY, v ? 'on' : 'off'); }} options={[[true, 'On'], [false, 'Off']]} />
        </Collapse>
        <QuestAnimations />
        <Collapse label="REST SCROLLS" summary={scrolls ? 'On' : 'Off'}>
          <p className="mb-2 text-xs text-text-secondary" style={{ lineHeight: 1.5 }}>A form cue or a monster taunt under the rest timer, written by your local AI when it's available.</p>
          <Segmented value={scrolls} onChange={(v) => { setScrolls(v); save(QUEST_SCROLL_KEY, v ? 'on' : 'off'); }} options={[[true, 'On'], [false, 'Off']]} />
        </Collapse>
      </div>
      <button onClick={() => setCard(true)} className="mt-4 w-full h-12 rounded-[15px] bg-bg-2 text-text-primary font-bold text-sm">
        Hero card · Lv {prof.lvl} {lvTitle(prof.lvl)}
      </button>
      {card && <QuestHeroCard open onClose={() => setCard(false)} />}
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

const swatches4 = (cols) => (
  <span className="flex gap-1 flex-shrink-0">
    {cols.map((c, i) => <span key={i} className="w-3 h-3 rounded-[4px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.3)' }} />)}
  </span>
);

// A Quest skin: page, card, sprite ink and accent, then what it is. Unlike an
// app theme it also restyles the stage, so it gets a full line of description.
function SkinRow({ skin, active, onSelect }) {
  return (
    <button onClick={onSelect}
      className="flex flex-col gap-1.5 items-start p-3.5 rounded-2xl text-left active:scale-[.97] transition-transform"
      style={{ background: active ? 'var(--g-acc-soft)' : 'var(--color-bg-2)', boxShadow: active ? 'inset 0 0 0 1.5px var(--color-accent)' : 'none' }}>
      <span className="flex items-center gap-2">
        {swatches4(swatchesOf(skin))}
        <span className="text-[13px] font-bold text-text-primary">{skin.name}</span>
        {skin.badge && <span className="g-label" style={{ fontSize: 8 }}>{skin.badge}</span>}
      </span>
      <span className="text-text-tertiary" style={{ font: `400 10px/1.45 ${MONO}` }}>{skin.desc}</span>
    </button>
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

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { useHeaderMessage } from '../context/HeaderMessageContext';
import { pageVariants, staggerItem } from '../lib/variants';
import Button from '../components/Button';
import * as api from '../lib/api';

const INFO = {
  progressionSpeed: 'How many consecutive workouts where you hit the top of your rep range before automatically increasing weight. Each exercise progresses independently based on YOUR performance.',
  upperCompoundIncrement: 'Weight increase for big upper body movements like bench press, overhead press, barbell row.',
  upperIsolatedIncrement: 'Weight increase for isolation upper body moves like curls, lateral raises, flyes, pushdowns.',
  lowerCompoundIncrement: 'Weight increase for big lower body movements like squat, leg press, hip thrust, deadlift.',
  lowerIsolatedIncrement: 'Weight increase for isolation lower body moves like leg curl, leg extension, calf raise.',
  coachingTone: 'How the AI coach communicates with you in chat and workout notes. Choose what motivates you best!',
};

function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-4 h-4 rounded-full bg-bg-3 border border-border text-[9px] text-text-tertiary flex items-center justify-center" aria-label="Info">
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
            className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 bg-bg-3 border border-border rounded-lg p-2.5 text-[11px] text-text-secondary leading-relaxed shadow-lg">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-bg-3 border-r border-b border-border rotate-45 -mt-1" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

const SPEED_OPTIONS = [
  { value: 6, label: 'Very Aggressive' },
  { value: 9, label: 'Aggressive' },
  { value: 12, label: 'Moderate' },
  { value: 15, label: 'Conservative' },
  { value: 18, label: 'Very Conservative' },
];
const UPPER_COMPOUND_OPTIONS = [2.5, 5, 7.5, 10];
const UPPER_ISOLATED_OPTIONS = [1.25, 2.5];
const LOWER_COMPOUND_OPTIONS = [2.5, 5, 7.5, 10];
const LOWER_ISOLATED_OPTIONS = [2.5, 5, 7.5];
const TONE_OPTIONS = [
  { value: 'encouraging', label: 'Encouraging' },
  { value: 'tough', label: 'Tough Love' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'chill', label: 'Chill' },
];

export default function AggressionPage() {
  const { settings, reloadSettings } = useWorkout();
  const { showToast } = useToast();
  const { showHeaderMessage } = useHeaderMessage();

  const [aggression, setAggression] = useState({
    progressionSpeed: 12,
    upperCompoundIncrement: 5, upperIsolatedIncrement: 2.5,
    lowerCompoundIncrement: 5, lowerIsolatedIncrement: 5,
    coachingTone: 'encouraging',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.aggressionSettings) {
      const a = typeof settings.aggressionSettings === 'string'
        ? JSON.parse(settings.aggressionSettings) : settings.aggressionSettings;
      setAggression((prev) => ({
        ...prev,
        progressionSpeed: a.progressionSpeed ?? prev.progressionSpeed,
        upperCompoundIncrement: a.upperCompoundIncrement ?? a.upperIncrement ?? prev.upperCompoundIncrement,
        upperIsolatedIncrement: a.upperIsolatedIncrement ?? a.upperIncrement ?? prev.upperIsolatedIncrement,
        lowerCompoundIncrement: a.lowerCompoundIncrement ?? a.lowerIncrement ?? prev.lowerCompoundIncrement,
        lowerIsolatedIncrement: a.lowerIsolatedIncrement ?? a.lowerIncrement ?? prev.lowerIsolatedIncrement,
        coachingTone: a.coachingTone ?? prev.coachingTone,
      }));
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateAggression(aggression);
      await reloadSettings(); // Progress reads these from context
      showHeaderMessage('Settings saved');
    } catch (e) {
      showToast('Error saving: ' + e.message, 'error');
    }
    setSaving(false);
  }, [aggression, showToast, showHeaderMessage, reloadSettings]);

  const set = (key) => (e) =>
    setAggression((a) => ({ ...a, [key]: parseFloat(e.target.value) || e.target.value }));

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="pb-4">
      <div className="px-4 pt-4 pb-2">
        <h1 className="font-display font-bold text-xl text-text-primary">Training Settings</h1>
        <p className="text-xs text-text-secondary mt-0.5">Configure how aggressively you progress</p>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {/* Progression Speed */}
        <motion.section variants={staggerItem} className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="flex items-center mb-2">
            <h2 className="font-display font-semibold text-xs text-text-secondary uppercase tracking-wider">Progression Speed</h2>
            <InfoTip text={INFO.progressionSpeed} />
          </div>
          <select value={aggression.progressionSpeed} onChange={set('progressionSpeed')}
            className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
            {SPEED_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label} ({opt.value} workouts)</option>)}
          </select>
          <p className="text-[10px] text-text-muted mt-1">Workouts needed before increasing weight</p>
        </motion.section>

        {/* Weight Increments */}
        <motion.section variants={staggerItem} className="bg-bg-2 border border-border rounded-xl p-3">
          <h2 className="font-display font-semibold text-xs text-text-secondary uppercase tracking-wider mb-3">Weight Increments</h2>
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center mb-1">
                <label className="text-[11px] font-mono text-text-tertiary">Upper Compound</label>
                <InfoTip text={INFO.upperCompoundIncrement} />
              </div>
              <select value={aggression.upperCompoundIncrement} onChange={set('upperCompoundIncrement')}
                className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
                {UPPER_COMPOUND_OPTIONS.map((v) => <option key={v} value={v}>{v} kg</option>)}
              </select>
              <p className="text-[9px] text-text-muted mt-0.5">Bench press, overhead press, barbell row, pull-ups</p>
            </div>
            <div>
              <div className="flex items-center mb-1">
                <label className="text-[11px] font-mono text-text-tertiary">Upper Isolated</label>
                <InfoTip text={INFO.upperIsolatedIncrement} />
              </div>
              <select value={aggression.upperIsolatedIncrement} onChange={set('upperIsolatedIncrement')}
                className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
                {UPPER_ISOLATED_OPTIONS.map((v) => <option key={v} value={v}>{v} kg</option>)}
              </select>
              <p className="text-[9px] text-text-muted mt-0.5">Curls, lateral raises, flyes, pushdowns</p>
            </div>
            <div>
              <div className="flex items-center mb-1">
                <label className="text-[11px] font-mono text-text-tertiary">Lower Compound</label>
                <InfoTip text={INFO.lowerCompoundIncrement} />
              </div>
              <select value={aggression.lowerCompoundIncrement} onChange={set('lowerCompoundIncrement')}
                className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
                {LOWER_COMPOUND_OPTIONS.map((v) => <option key={v} value={v}>{v} kg</option>)}
              </select>
              <p className="text-[9px] text-text-muted mt-0.5">Squat, leg press, hip thrust, deadlift</p>
            </div>
            <div>
              <div className="flex items-center mb-1">
                <label className="text-[11px] font-mono text-text-tertiary">Lower Isolated</label>
                <InfoTip text={INFO.lowerIsolatedIncrement} />
              </div>
              <select value={aggression.lowerIsolatedIncrement} onChange={set('lowerIsolatedIncrement')}
                className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
                {LOWER_ISOLATED_OPTIONS.map((v) => <option key={v} value={v}>{v} kg</option>)}
              </select>
              <p className="text-[9px] text-text-muted mt-0.5">Leg curl, leg extension, calf raise</p>
            </div>
          </div>
        </motion.section>

        {/* Coaching Tone */}
        <motion.section variants={staggerItem} className="bg-bg-2 border border-border rounded-xl p-3">
          <div className="flex items-center mb-2">
            <h2 className="font-display font-semibold text-xs text-text-secondary uppercase tracking-wider">Coaching Tone</h2>
            <InfoTip text={INFO.coachingTone} />
          </div>
          <select value={aggression.coachingTone} onChange={set('coachingTone')}
            className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 appearance-none">
            {TONE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <p className="text-[10px] text-text-muted mt-1">AI personality in chat and workout feedback</p>
        </motion.section>

        <Button variant="primary" onClick={handleSave} disabled={saving} size="lg" className="w-full">
          {saving ? 'Saving...' : 'Save Training Settings'}
        </Button>
      </div>
    </motion.div>
  );
}

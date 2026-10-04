import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Modal from './Modal';
import Button from './Button';
import NavIcon from './NavIcon';
import { EXERCISE_LIST_ID } from './ExerciseNameOptions';

// Full 26-group exercise database matching legacy server.js
const exerciseDatabase = {
  lats: ['Lat Pulldown', 'Wide Grip Lat Pulldown', 'Pull-Ups', 'Chin-Ups', 'Assisted Pull-Ups', 'Neutral Grip Pulldown', 'Single Arm Lat Pulldown', 'Straight Arm Pulldown', 'Close Grip Pulldown'],
  mid_back: ['Barbell Row', 'Dumbbell Row', 'T-Bar Row', 'Seated Cable Row', 'Chest Supported Row', 'Pendlay Row', 'Meadows Row', 'Machine Row', 'Inverted Row'],
  lower_back: ['Deadlift', 'Romanian Deadlift', 'Rack Pulls', 'Hyperextensions', 'Back Extensions', 'Good Mornings', 'Reverse Hyperextensions', 'Stiff Leg Deadlift'],
  traps: ['Barbell Shrugs', 'Dumbbell Shrugs', 'Cable Shrugs', 'Upright Rows', 'Face Pulls', 'Farmer Carries', 'Trap Bar Shrugs'],
  upper_chest: ['Incline Barbell Bench Press', 'Incline Dumbbell Bench Press', 'Incline Cable Flyes', 'Incline Machine Press', 'Low to High Cable Flyes', 'Landmine Press'],
  mid_chest: ['Flat Barbell Bench Press', 'Flat Dumbbell Bench Press', 'Flat Cable Flyes', 'Machine Chest Press', 'Push-Ups', 'Pec Deck Machine'],
  lower_chest: ['Decline Barbell Bench Press', 'Decline Dumbbell Bench Press', 'Chest Dips', 'High to Low Cable Flyes', 'Decline Cable Flyes'],
  quads: ['Barbell Squat', 'Front Squat', 'Leg Press', 'Leg Extension', 'Hack Squat', 'Goblet Squat', 'Bulgarian Split Squat', 'Sissy Squat', 'Belt Squat'],
  hamstrings: ['Romanian Deadlift', 'Lying Leg Curl', 'Seated Leg Curl', 'Nordic Curls', 'Stiff Leg Deadlift', 'Good Mornings', 'Glute Ham Raise'],
  glutes: ['Hip Thrusts', 'Glute Bridges', 'Bulgarian Split Squat', 'Cable Pull Throughs', 'Reverse Hyperextensions', 'Walking Lunges', 'Kickbacks'],
  calves: ['Standing Calf Raises', 'Seated Calf Raises', 'Donkey Calf Raises', 'Single Leg Calf Raises', 'Calf Press on Leg Press'],
  front_delts: ['Overhead Press', 'Dumbbell Shoulder Press', 'Arnold Press', 'Front Raises', 'Machine Shoulder Press', 'Landmine Press', 'Push Press'],
  side_delts: ['Lateral Raises', 'Cable Lateral Raises', 'Machine Lateral Raises', 'Upright Rows', 'W Raises', 'Lu Raises'],
  rear_delts: ['Rear Delt Flyes', 'Face Pulls', 'Reverse Pec Deck', 'Bent Over Reverse Flyes', 'Cable Rear Delt Flyes', 'Prone Reverse Flyes'],
  triceps_long_head: ['Overhead Tricep Extension', 'Dumbbell Overhead Extension', 'Cable Overhead Extension', 'French Press', 'Lying Tricep Extension'],
  triceps_lateral_head: ['Cable Tricep Pushdown', 'Rope Pushdown', 'V-Bar Pushdown', 'Reverse Grip Pushdown', 'Close-Grip Bench Press', 'JM Press'],
  triceps_all_heads: ['Tricep Dips', 'Diamond Push-Ups', 'Skull Crushers', 'Bench Dips', 'Tricep Kickbacks', 'Tate Press'],
  biceps_long_head: ['Incline Dumbbell Curl', 'Drag Curl', 'Bayesian Curl', 'Cable Curl (arms back)', 'Spider Curl'],
  biceps_short_head: ['Preacher Curl', 'Concentration Curl', 'Spider Curl', 'Cable Curl (arms forward)', 'Scott Curl'],
  biceps_both_heads: ['Barbell Curl', 'Dumbbell Curl', 'EZ Bar Curl', 'Cable Curl', '21s'],
  brachialis: ['Hammer Curl', 'Reverse Curl', 'Cable Hammer Curl', 'Cross Body Hammer Curl', 'Zottman Curl'],
  upper_abs: ['Crunches', 'Cable Crunches', 'Sit-Ups', 'Ab Wheel Rollout', 'Decline Sit-Ups'],
  lower_abs: ['Leg Raises', 'Hanging Leg Raises', 'Reverse Crunches', 'Mountain Climbers', 'Knee Raises'],
  obliques: ['Russian Twists', 'Side Plank', 'Woodchoppers', 'Bicycle Crunches', 'Side Bends'],
  full_core: ['Plank', 'Dead Bug', 'Bird Dog', 'Pallof Press', 'Hollow Body Hold'],
};

// Granular muscle group detection matching legacy server.js
function detectMuscleGroup(exerciseName) {
  const name = (exerciseName || '').toLowerCase();

  // Lats
  if (/lat pulldown|lat pull down|pull.?up|chin.?up|straight arm pulldown/.test(name)) return ['lats'];
  // Traps
  if (/shrug|trap|farmer/.test(name)) return ['traps'];
  // Lower back
  if (/hyperextension|back extension|good morning|rack pull/.test(name)) return ['lower_back'];
  if (/deadlift|rdl/.test(name) && !/romanian|stiff leg/.test(name)) return ['lower_back', 'hamstrings'];
  if (/romanian deadlift|stiff leg deadlift/.test(name)) return ['hamstrings', 'lower_back'];
  // Rows → mid back
  if (/row/.test(name) && !/upright/.test(name)) return ['mid_back'];
  // Chest — specific regions
  if (/incline/.test(name) && /bench|press|fly|flye/.test(name)) return ['upper_chest'];
  if (/decline/.test(name) && /bench|press|fly|flye/.test(name)) return ['lower_chest'];
  if (/chest.*dip/.test(name)) return ['lower_chest'];
  if (/bench|chest.*press|fly|flye|pec|push.?up/.test(name)) return ['mid_chest', 'upper_chest', 'lower_chest'];
  // Calves
  if (/calf|calves/.test(name)) return ['calves'];
  // Glutes
  if (/hip thrust|glute bridge|kickback|pull through/.test(name)) return ['glutes'];
  // Hamstrings
  if (/leg curl|nordic|glute ham raise/.test(name)) return ['hamstrings'];
  // Quads
  if (/squat|leg press|leg extension|hack|sissy|lunge|split squat/.test(name)) return ['quads'];
  // Rear delts
  if (/rear delt|face pull|reverse fly|reverse flye|reverse pec/.test(name)) return ['rear_delts'];
  // Side delts
  if (/lateral raise|side raise|w raise|lu raise|upright row/.test(name)) return ['side_delts'];
  // Front delts / shoulder press
  if (/front raise/.test(name)) return ['front_delts'];
  if (/overhead press|military press|shoulder press|arnold press|push press/.test(name)) return ['front_delts'];
  // Triceps
  if (/overhead.*tricep|overhead.*extension|french press|lying.*extension/.test(name)) return ['triceps_long_head'];
  if (/pushdown|rope push|v.bar|reverse grip.*push|close.?grip bench|jm press/.test(name)) return ['triceps_lateral_head'];
  if (/tricep.*dip|diamond.*push|skull crush|bench dip|tricep kick|tate press/.test(name)) return ['triceps_all_heads'];
  if (/tricep/.test(name)) return ['triceps_all_heads'];
  // Biceps
  if (/incline.*curl|drag curl|bayesian|cable curl.*back/.test(name)) return ['biceps_long_head'];
  if (/preacher|concentration|scott|cable curl.*forward/.test(name)) return ['biceps_short_head'];
  if (/hammer|reverse curl|zottman|cross body/.test(name)) return ['brachialis'];
  if (/curl|bicep/.test(name)) return ['biceps_both_heads'];
  // Core
  if (/crunch|sit.?up|ab wheel|decline sit/.test(name) && !/reverse/.test(name) && !/bicycle/.test(name)) return ['upper_abs'];
  if (/leg raise|hanging|reverse crunch|mountain climb|knee raise/.test(name)) return ['lower_abs'];
  if (/russian twist|side plank|woodchop|bicycle crunch|side bend|oblique/.test(name)) return ['obliques'];
  if (/plank|dead bug|bird dog|pallof|hollow/.test(name)) return ['full_core'];
  if (/core|ab /.test(name)) return ['full_core'];

  return ['mid_back']; // fallback
}

export default function SubstituteModal({ open, onClose, exerciseName, onSelect }) {
  const [customInput, setCustomInput] = useState('');

  const { groups, alternatives } = useMemo(() => {
    const g = detectMuscleGroup(exerciseName);
    const alts = [];
    const seen = new Set();
    for (const group of g) {
      for (const ex of exerciseDatabase[group] || []) {
        if (ex.toLowerCase() !== exerciseName.toLowerCase() && !seen.has(ex)) {
          alts.push(ex);
          seen.add(ex);
        }
      }
    }
    return { groups: g, alternatives: alts.slice(0, 12) };
  }, [exerciseName]);

  const handleSelect = useCallback((name) => {
    onSelect(name);
    onClose();
  }, [onSelect, onClose]);

  const handleCustom = useCallback(() => {
    if (customInput.trim()) {
      handleSelect(customInput.trim());
      setCustomInput('');
    }
  }, [customInput, handleSelect]);

  const groupLabel = useMemo(() => {
    return groups.map((g) => g.replace(/_/g, ' ')).join(' / ');
  }, [groups]);

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-1.5"><NavIcon id="swap" size={16} />Substitute Exercise</span>}>
      <div className="p-4">
        <div className="mb-4">
          <span className="text-xs font-mono text-text-tertiary">REPLACING:</span>
          <div className="font-display font-semibold text-text-primary">{exerciseName}</div>
          <div className="text-xs text-accent font-mono mt-0.5 capitalize">{groupLabel}</div>
        </div>

        {/* Custom input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustom()}
            placeholder="Or type a custom exercise..."
            list={EXERCISE_LIST_ID}
            className="flex-1 bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
          />
          <Button variant="primary" onClick={handleCustom} disabled={!customInput.trim()}>
            Use
          </Button>
        </div>

        {/* Alternatives */}
        <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
          {alternatives.map((alt) => (
            <motion.button
              key={alt}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(alt)}
              className="w-full text-left p-3 bg-bg-2 border border-border rounded-xl text-sm text-text-primary hover:border-accent/30 transition-colors"
            >
              {alt}
            </motion.button>
          ))}
          {alternatives.length === 0 && (
            <div className="text-center text-xs text-text-muted py-4">No alternatives found — use custom input above</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

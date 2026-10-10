import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { useHeaderMessage } from '../context/HeaderMessageContext';
import { useElapsed } from '../hooks/useElapsed';
import useBackHandler from '../hooks/useBackHandler';
import { staggerContainer, pageVariants } from '../lib/variants';
import ExerciseCard from '../components/ExerciseCard';
import BlockGridView from '../components/BlockGridView';
import SupersetCard from '../components/SupersetCard';
import CardioCard from '../components/CardioCard';
import FocusWorkout from '../components/FocusWorkout';
import QuestTitle from '../components/QuestTitle';
import { Countdown, FinishFlow } from '../components/FocusTransitions';
import { summarize, workoutLayout as readLayout } from '../lib/focus';
import { moodState } from '../lib/mood';

import Button from '../components/Button';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import WorkoutComplete from '../components/WorkoutComplete';
import NavIcon from '../components/NavIcon';
import * as api from '../lib/api';
import { useGlobalTimer } from '../context/TimerContext';
import { EXERCISE_LIST_ID } from '../components/ExerciseNameOptions';
import {
  supersetRows, supersetMembersOf, supersetRestMode,
  roundOfSet, roundComplete, SHARED,
} from '../lib/supersets';

const CARDIO_FIELDS = [
  { key: 'activityType', label: 'Activity' },
  { key: 'duration', label: 'Duration' },
  { key: 'activeCalories', label: 'Active Cal' },
  { key: 'totalCalories', label: 'Total Cal' },
  { key: 'avgHeartRate', label: 'Avg HR', suffix: ' bpm' },
  { key: 'maxHeartRate', label: 'Max HR', suffix: ' bpm' },
  { key: 'distance', label: 'Distance' },
  { key: 'avgPace', label: 'Avg Pace' },
  { key: 'source', label: 'Source' },
];

function compressImage(file, maxWidth = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function WorkoutPage({ onNavigate }) {
  const { activeWorkout, updateActiveWorkout, finishWorkout, cancelWorkout, programs, reloadPrograms, workoutHistory } = useWorkout();
  const { showToast } = useToast();
  const { showHeaderMessage } = useHeaderMessage();
  const { display: elapsed } = useElapsed(activeWorkout?.startTime);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [showCancel, setShowCancel] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeResult, setCompleteResult] = useState(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState('8-12');
  const [newExRest, setNewExRest] = useState(90);
  const [cardioStats, setCardioStats] = useState(null);
  const [cardioLoading, setCardioLoading] = useState(false);
  const [variationData, setVariationData] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [workoutLayout] = useState(readLayout);
  const isQuest = workoutLayout === 'quest';
  const isFocus = workoutLayout === 'focus' || workoutLayout === 'dense' || isQuest;
  // A workout started a moment ago (from Programs) opens with the countdown.
  // Quest Mode has its own opening: the hero setting off across the meadow.
  const [countdown, setCountdown] = useState(() =>
    isFocus && !isQuest && !!activeWorkout && Date.now() - new Date(activeWorkout.startTime).getTime() < 4000);
  const [finishing, setFinishing] = useState(null); // { summary } while the finish flow is up
  const [finishError, setFinishError] = useState(null);
  const [activeTimerIndices, setActiveTimerIndices] = useState({});

  const handleTimerActiveChange = useCallback((exerciseIndex, isActive) => {
    setActiveTimerIndices(prev => {
      if (prev[exerciseIndex] === isActive) return prev;
      const next = { ...prev };
      if (isActive) next[exerciseIndex] = true;
      else delete next[exerciseIndex];
      return next;
    });
  }, []);

  const anyTimerActive = useMemo(() => Object.keys(activeTimerIndices).length > 0, [activeTimerIndices]);

  // Supersets render as one card, so the list iterates rows, not exercises.
  const exerciseRows = useMemo(
    () => supersetRows(activeWorkout?.exercises || []),
    [activeWorkout?.exercises],
  );
  // Block-grid view has no cardio support (wall-clock timer, photo capture) — fall back to classic for those workouts.
  const hasCardio = !!activeWorkout?.exercises?.some(ex => ex.type === 'cardio' || ex.sets?.[0]?.type === 'cardio');
  const useBlockGrid = workoutLayout === 'block-grid' && !hasCardio;

  // Android back gesture closes inline overlays (ConfirmDialog/Modal handle
  // their own; these two are custom inline implementations).
  useBackHandler(showFinish, () => setShowFinish(false));
  useBackHandler(!!variationData, () => setVariationData(null));

  const handleUpdateSet = useCallback((exerciseIndex, setIndex, data) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const sets = [...next.exercises[exerciseIndex].sets];
      sets[setIndex] = data;

      // If this is a normal set being completed/uncompleted,
      // cascade that state to all drop sets that immediately follow it
      if (data.type !== 'drop' && typeof data.completed === 'boolean') {
        let i = setIndex + 1;
        while (i < sets.length && sets[i].type === 'drop') {
          sets[i] = { ...sets[i], completed: data.completed };
          i++;
        }
      }

      next.exercises[exerciseIndex] = {
        ...next.exercises[exerciseIndex],
        sets,
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleDeleteSet = useCallback((exerciseIndex, setIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      next.exercises[exerciseIndex] = {
        ...next.exercises[exerciseIndex],
        sets: next.exercises[exerciseIndex].sets.filter((_, i) => i !== setIndex),
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleAddSet = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      // Find the last normal set for weight prefill
      const lastNormal = [...ex.sets].reverse().find(s => s.type !== 'drop');
      const newNormalSet = { reps: '', weight: lastNormal?.weight || '', completed: false };
      const numDrops = ex.numDrops || 0;
      const dropSets = Array.from({ length: numDrops }, (_, i) => ({
        reps: '', weight: '', completed: false, type: 'drop', dropIndex: i,
      }));
      next.exercises[exerciseIndex] = {
        ...ex,
        sets: [...ex.sets, newNormalSet, ...dropSets],
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const { start: startGlobalTimer } = useGlobalTimer();

  const handleSetComplete = useCallback((exerciseIndex, setIndex, restSeconds) => {
    moodState.pulse = Date.now();
    const exercises = activeWorkout?.exercises || [];
    const members = supersetMembersOf(exercises, exerciseIndex);

    if (members && supersetRestMode(exercises, members) === SHARED) {
      const round = roundOfSet(exercises[exerciseIndex], setIndex);
      // Mid-round you go straight into the partner, so nothing starts here. The
      // set being checked isn't in state yet, hence passing it in explicitly.
      if (round < 0 || !roundComplete(exercises, members, round, { exerciseIndex, setIndex })) return;
      const shared = exercises[members[0]]?.restSeconds ?? restSeconds;
      if (shared > 0) startGlobalTimer(shared);
      return;
    }

    if (restSeconds > 0) {
      startGlobalTimer(restSeconds);
    }
  }, [activeWorkout, startGlobalTimer]);

  const handleUpdateRepRange = useCallback((exerciseIndex, value) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      next.exercises[exerciseIndex] = { ...next.exercises[exerciseIndex], targetReps: value, repRange: value };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleUpdateRest = useCallback((exerciseIndex, value) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      // One shared rest is one number: editing it from either half of a superset
      // moves both, so the card header can't disagree with the rest picker.
      const members = supersetMembersOf(next.exercises, exerciseIndex);
      const targets = members && supersetRestMode(next.exercises, members) === SHARED
        ? members
        : [exerciseIndex];
      targets.forEach((i) => { next.exercises[i] = { ...next.exercises[i], restSeconds: value }; });
      return next;
    });
  }, [updateActiveWorkout]);

  // Per-superset toggle: one rest after the round, or each exercise on its own.
  const handleSetSupersetRest = useCallback((indices, mode) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      indices.forEach((i) => { next.exercises[i] = { ...next.exercises[i], supersetRest: mode }; });
      return next;
    });
  }, [updateActiveWorkout]);

  const handleSubstitute = useCallback((exerciseIndex, newName) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const orig = next.exercises[exerciseIndex].name;
      next.exercises[exerciseIndex] = {
        ...next.exercises[exerciseIndex],
        name: newName,
        substituted: { original: orig, replacement: newName },
      };
      return next;
    });
    showToast(`Substituted: ${newName}`, 'success');
  }, [updateActiveWorkout, showToast]);

  const handleAddDropSet = useCallback((exerciseIndex, numDrops) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      // Store the number of drops on the exercise so handleAddSet knows too
      // Rebuild sets: after each normal set, insert the drops
      const newSets = [];
      const normalSets = ex.sets.filter(s => s.type !== 'drop');
      normalSets.forEach((set) => {
        newSets.push({ ...set, type: undefined, dropIndex: undefined });
        for (let i = 0; i < numDrops; i++) {
          newSets.push({ reps: '', weight: '', completed: false, type: 'drop', dropIndex: i });
        }
      });
      next.exercises[exerciseIndex] = {
        ...ex,
        numDrops,
        sets: newSets,
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleRemoveDropSet = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      next.exercises[exerciseIndex] = {
        ...ex,
        numDrops: 0,
        sets: ex.sets.filter(s => s.type !== 'drop'),
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleAddBFR = useCallback((exerciseIndex, seconds) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      // Convert all non-drop sets to BFR sets, preserve drops
      const newSets = ex.sets.map(s =>
        s.type === 'drop' ? s : { ...s, type: 'bfr', bfrSeconds: seconds, reps: '' }
      );
      next.exercises[exerciseIndex] = { ...ex, bfrSeconds: seconds, sets: newSets };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleRemoveBFR = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const newSets = ex.sets.map(s =>
        s.type === 'bfr' ? { ...s, type: undefined, bfrSeconds: undefined } : s
      );
      next.exercises[exerciseIndex] = { ...ex, bfrSeconds: undefined, sets: newSets };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleAddInterval = useCallback((exerciseIndex, work, rest, total) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const newSets = ex.sets.map(s =>
        s.type === 'drop' ? s : { ...s, type: 'interval', intervalWork: work, intervalRest: rest, intervalTotal: total, reps: '' }
      );
      next.exercises[exerciseIndex] = { ...ex, sets: newSets };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleAddVariable = useCallback((exerciseIndex, variableSets) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const newSets = variableSets.map((vs, i) => {
        const existing = ex.sets.filter(s => s.type !== 'variable')[i] || ex.sets[i] || {};
        return {
          reps: existing.reps || '',
          weight: vs.weight || existing.weight || '',
          completed: false,
          type: 'variable',
          variableRepRange: vs.repRange || '8-12',
        };
      });
      next.exercises[exerciseIndex] = { ...ex, isVariable: true, variableSets, sets: newSets };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleRemoveVariable = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const newSets = ex.sets
        .filter(s => s.type === 'variable')
        .map(s => ({ reps: s.reps || '', weight: s.weight || '', completed: false }));
      next.exercises[exerciseIndex] = {
        ...ex,
        isVariable: false,
        variableSets: undefined,
        sets: newSets.length > 0 ? newSets : ex.sets.map(s => ({ reps: s.reps || '', weight: s.weight || '', completed: false })),
      };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleRemoveInterval = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const newSets = ex.sets.map(s =>
        s.type === 'interval' ? { ...s, type: undefined, intervalWork: undefined, intervalRest: undefined, intervalTotal: undefined } : s
      );
      next.exercises[exerciseIndex] = { ...ex, sets: newSets };
      return next;
    });
  }, [updateActiveWorkout]);

  const handleLinkSuperset = useCallback((exerciseIndex, partnerName) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      next.exercises[exerciseIndex] = {
        ...next.exercises[exerciseIndex],
        supersetWith: partnerName,
      };
      // Also link the partner if it exists in the list
      const partnerIdx = next.exercises.findIndex(e => e.name === partnerName);
      if (partnerIdx >= 0 && partnerIdx !== exerciseIndex) {
        next.exercises[partnerIdx] = {
          ...next.exercises[partnerIdx],
          supersetWith: next.exercises[exerciseIndex].name,
        };
      }
      return next;
    });
  }, [updateActiveWorkout]);

  const handleUnlinkSuperset = useCallback((exerciseIndex) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const ex = next.exercises[exerciseIndex];
      const partnerName = ex.supersetWith;
      next.exercises[exerciseIndex] = { ...ex, supersetWith: undefined };
      // Unlink partner too
      if (partnerName) {
        const partnerIdx = next.exercises.findIndex(e => e.name === partnerName);
        if (partnerIdx >= 0) {
          next.exercises[partnerIdx] = { ...next.exercises[partnerIdx], supersetWith: undefined };
        }
      }
      return next;
    });
  }, [updateActiveWorkout]);


  // Update exercise-level fields on a cardio exercise (name, targetDurationSec, etc.)
  const handleUpdateCardioExercise = useCallback((exerciseIndex, updates) => {
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      next.exercises[exerciseIndex] = {
        ...next.exercises[exerciseIndex],
        ...updates,
      };
      return next;
    });
  }, [updateActiveWorkout]);


  const handleMoveUp = useCallback((ei) => {
    if (ei === 0) return;
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      [next.exercises[ei - 1], next.exercises[ei]] = [next.exercises[ei], next.exercises[ei - 1]];
      return next;
    });
  }, [updateActiveWorkout]);

  const handleMoveDown = useCallback((ei) => {
    updateActiveWorkout((prev) => {
      if (!prev || ei >= prev.exercises.length - 1) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      [next.exercises[ei], next.exercises[ei + 1]] = [next.exercises[ei + 1], next.exercises[ei]];
      return next;
    });
  }, [updateActiveWorkout]);

  const handleRemoveExercise = useCallback((ei) => {
    updateActiveWorkout((prev) => {
      if (!prev || prev.exercises.length <= 1) return prev;
      return { ...prev, exercises: prev.exercises.filter((_, i) => i !== ei) };
    });
    showToast('Exercise removed', 'info');
  }, [updateActiveWorkout, showToast]);

  const handleAddExercise = useCallback(() => {
    if (!newExName.trim()) return showToast('Enter an exercise name', 'error');
    updateActiveWorkout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: [...prev.exercises, {
          name: newExName.trim(),
          targetSets: newExSets,
          targetReps: newExReps,
          repRange: newExReps,
          restSeconds: newExRest,
          sets: Array.from({ length: newExSets }, () => ({ reps: '', weight: '', completed: false })),
          notes: [],
        }],
      };
    });
    showToast(`Added ${newExName.trim()}`, 'success');
    setNewExName(''); setNewExSets(3); setNewExReps('8-12'); setNewExRest(90);
    setShowAddExercise(false);
  }, [newExName, newExSets, newExReps, newExRest, updateActiveWorkout, showToast]);

  const handleCardioUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardioLoading(true);
    try {
      const compressed = await compressImage(file);
      const data = await api.extractCardioStats(compressed.base64, compressed.mediaType);
      if (data.success && data.stats) {
        setCardioStats(data.stats);
        showToast('Cardio stats extracted!', 'success');
      } else {
        showToast('Could not extract stats', 'error');
      }
    } catch { showToast('Failed to process image', 'error'); }
    setCardioLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [showToast]);

  const detectChanges = useCallback(() => {
    if (!activeWorkout?.originalExercises) return null;
    const originals = activeWorkout.originalExercises;
    const current = activeWorkout.exercises;
    const changes = [];
    if (current.length !== originals.length) changes.push(current.length > originals.length ? 'Added exercises' : 'Removed exercises');
    const origNames = originals.map((e) => e.name);
    const currNames = current.map((e) => e.name);
    const added = currNames.filter((n) => !origNames.includes(n));
    const removed = origNames.filter((n) => !currNames.includes(n));
    if (added.length > 0) changes.push('Added: ' + added.join(', '));
    if (removed.length > 0) changes.push('Removed: ' + removed.join(', '));
    current.forEach((ex) => {
      if (ex.type === 'cardio') return; // skip cardio for variation detection
      const orig = originals.find((o) => o.name === ex.name);
      if (!orig || !ex.sets) return;
      const normalSets = ex.sets.filter(s => s.type !== 'drop');
      const hasDrops = ex.sets.some(s => s.type === 'drop');
      const hasBFR = ex.sets.some(s => s.type === 'bfr');
      const hasInterval = ex.sets.some(s => s.type === 'interval');
      const hasVariable = ex.sets.some(s => s.type === 'variable');
      const failureIndices = ex.sets.map((s, i) => s.reps === 'failure' ? i : -1).filter(i => i >= 0);
      const origHadDrops = orig.hasDrops || false;
      const origHadBFR = orig.isBFR || false;
      const origHadInterval = orig.isInterval || false;
      const origHadVariable = orig.isVariable || false;
      const origFailureCount = (orig.failureIndices || []).length;
      if (normalSets.length !== orig.sets) changes.push(`${ex.name}: ${orig.sets} → ${normalSets.length} sets`);
      if (hasDrops && !origHadDrops) changes.push(`Added drop sets to ${ex.name}`);
      if (!hasDrops && origHadDrops) changes.push(`Removed drop sets from ${ex.name}`);
      if (hasBFR && !origHadBFR) changes.push(`Added BFR to ${ex.name}`);
      if (!hasBFR && origHadBFR) changes.push(`Removed BFR from ${ex.name}`);
      if (hasInterval && !origHadInterval) changes.push(`Added intervals to ${ex.name}`);
      if (!hasInterval && origHadInterval) changes.push(`Removed intervals from ${ex.name}`);
      if (hasVariable && !origHadVariable) changes.push(`Variable sets on ${ex.name}`);
      if (!hasVariable && origHadVariable) changes.push(`Removed variable sets from ${ex.name}`);
      if (failureIndices.length > 0 && origFailureCount === 0) changes.push(`${failureIndices.length} failure set${failureIndices.length > 1 ? 's' : ''} on ${ex.name}`);
      if (failureIndices.length === 0 && origFailureCount > 0) changes.push(`Removed failure sets from ${ex.name}`);
      // Both halves carry the link — describe the pair once, from whichever comes first.
      if (ex.supersetWith && !orig.supersetWith && !changes.some((c) => c.includes(`${ex.supersetWith} supersetted with ${ex.name}`))) {
        changes.push(`${ex.name} supersetted with ${ex.supersetWith}`);
      }
      if (!ex.supersetWith && orig.supersetWith) changes.push(`Removed superset from ${ex.name}`);
    });
    if (changes.length === 0) return null;
    return { programId: activeWorkout.programId, programName: activeWorkout.programName, originalWorkoutName: activeWorkout.workoutName, changeDescription: changes.join('. '), exercises: current.map((ex) => {
      if (ex.type === 'cardio') {
        return {
          name: ex.name,
          type: 'cardio',
          sets: 1,
          targetDurationSec: ex.targetDurationSec || 0,
          repRange: 'cardio',
          restSeconds: 0,
        };
      }
      const normalSets = (ex.sets || []).filter(s => s.type !== 'drop' && s.type !== 'bfr' && s.type !== 'interval' && s.type !== 'variable');
      const dropSets = (ex.sets || []).filter(s => s.type === 'drop');
      const hasBFR = (ex.sets || []).some(s => s.type === 'bfr');
      const hasInterval = (ex.sets || []).some(s => s.type === 'interval');
      const hasVariableType = (ex.sets || []).some(s => s.type === 'variable');
      const hasDrops = dropSets.length > 0;
      const inferredNumDrops = normalSets.length > 0 ? Math.round(dropSets.length / normalSets.length) : (ex.numDrops || 0);
      const bfrSet = (ex.sets || []).find(s => s.type === 'bfr');
      const intervalSet = (ex.sets || []).find(s => s.type === 'interval');
      const varSets = (ex.sets || []).filter(s => s.type === 'variable');
      const failureIndices = (ex.sets || []).map((s, i) => s.reps === 'failure' ? i : -1).filter(i => i >= 0);
      return {
        name: ex.name,
        sets: hasBFR || hasInterval || hasVariableType ? (ex.sets || []).filter(s => s.type !== 'drop').length : normalSets.length || ex.sets?.filter?.(s => s.type !== 'drop').length || 4,
        repRange: ex.targetReps || ex.repRange || '8-12',
        restSeconds: ex.restSeconds || 90,
        hasDrops,
        numDrops: inferredNumDrops,
        isBFR: hasBFR,
        bfrSeconds: bfrSet?.bfrSeconds || ex.bfrSeconds || 45,
        isInterval: hasInterval,
        intervalWork: intervalSet?.intervalWork || ex.intervalWork || 30,
        intervalRest: intervalSet?.intervalRest || ex.intervalRest || 30,
        intervalTotal: intervalSet?.intervalTotal || ex.intervalTotal || 180,
        isVariable: hasVariableType,
        variableSets: hasVariableType ? varSets.map(s => ({ weight: s.weight, repRange: s.variableRepRange })) : undefined,
        supersetWith: ex.supersetWith || null,
        ...(failureIndices.length > 0 ? { failureIndices } : {}),
      };
    }) };
  }, [activeWorkout]);

  const saveVariation = useCallback(async (vData) => {
    try {
      const program = programs.find((p) => p.id === vData.programId) || programs.find((p) => p.name === vData.programName);
      if (!program) { showToast('Could not find program', 'error'); return; }
      const workouts = typeof program.workouts === 'string' ? JSON.parse(program.workouts) : program.workouts || [];
      let baseName = vData.originalWorkoutName;
      const origWorkout = workouts.find((w) => w.name === baseName);
      if (origWorkout?.variationOf) baseName = origWorkout.variationOf;
      const existingVariations = workouts.filter((w) => w.variationOf === baseName);
      const highestNum = existingVariations.reduce((max, w) => {
        const m = w.name.match(/\(Variation (\d+)\)$/i);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      const nextNum = highestNum > 0 ? highestNum + 1 : existingVariations.length + 1;
      await api.updateProgram(program.id, program.name, [...workouts, { name: `${baseName} (Variation ${nextNum})`, variationOf: baseName, variationChanges: vData.changeDescription, exercises: vData.exercises }]);
      await reloadPrograms();
      showToast('Variation saved!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }, [programs, reloadPrograms, showToast]);

  // The Focus finish flow opens before the save so its analysis screen can
  // pace itself to the request; the summary is taken first because
  // finishWorkout clears the active workout.
  const runFinish = useCallback(async (afterSave) => {
    setCompleting(true);
    setFinishError(null);
    if (isFocus) setFinishing({ summary: summarize(activeWorkout, workoutHistory) });
    try {
      const result = await finishWorkout(cardioStats);
      if (afterSave) await afterSave();
      setCompleteResult(result);
    } catch (e) {
      if (isFocus) setFinishError(e.message);
      else showToast('Error: ' + e.message, 'error');
      setCompleting(false);
    }
  }, [isFocus, activeWorkout, workoutHistory, finishWorkout, cardioStats, showToast]);

  const handleConfirmFinish = useCallback(async () => {
    setShowFinish(false);
    const changes = detectChanges();
    if (changes) { setVariationData(changes); return; }
    runFinish();
  }, [detectChanges, runFinish]);

  const handleFinishEarly = useCallback(async () => {
    setShowFinish(false);
    runFinish();
  }, [runFinish]);

  const handleVariationDecision = useCallback(async (saveAsVar) => {
    const vData = variationData;
    setVariationData(null);
    runFinish(saveAsVar && vData ? () => saveVariation(vData) : null);
  }, [variationData, runFinish, saveVariation]);

  const handleCancel = useCallback(async () => {
    setShowCancel(false);
    try {
      await cancelWorkout();
      showHeaderMessage('Workout cancelled');
      onNavigate('programs');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }, [cancelWorkout, showToast, onNavigate, showHeaderMessage]);

  // Every card — plain, superset member, or block-grid panel — takes the same
  // handler set, so it's built once rather than spelled out at each call site.
  const cardHandlers = useMemo(() => ({
    onUpdateSet: handleUpdateSet,
    onDeleteSet: handleDeleteSet,
    onAddSet: handleAddSet,
    onSetComplete: handleSetComplete,
    onUpdateRepRange: handleUpdateRepRange,
    onUpdateRest: handleUpdateRest,
    onSubstitute: handleSubstitute,
    onAddDropSet: handleAddDropSet,
    onRemoveDropSet: handleRemoveDropSet,
    onAddBFR: handleAddBFR,
    onRemoveBFR: handleRemoveBFR,
    onAddInterval: handleAddInterval,
    onRemoveInterval: handleRemoveInterval,
    onLinkSuperset: handleLinkSuperset,
    onUnlinkSuperset: handleUnlinkSuperset,
    onAddVariable: handleAddVariable,
    onRemoveVariable: handleRemoveVariable,
    onUpdateCardioExercise: handleUpdateCardioExercise,
  }), [handleUpdateCardioExercise, handleUpdateSet, handleDeleteSet, handleAddSet, handleSetComplete,
       handleUpdateRepRange, handleUpdateRest, handleSubstitute, handleAddDropSet,
       handleRemoveDropSet, handleAddBFR, handleRemoveBFR, handleAddInterval,
       handleRemoveInterval, handleLinkSuperset, handleUnlinkSuperset,
       handleAddVariable, handleRemoveVariable]);

  // Every return keeps the same motion.div root. App's AnimatePresence
  // (mode="wait") only re-checks for exit completion when a motion child
  // finishes; if this page swapped its motion root for a plain element while
  // exiting, the check never runs and the old page stays on screen forever
  // while the nav moves on.
  if (finishing) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <FinishFlow
        quest={isQuest}
        summary={finishing.summary}
        result={completeResult}
        failed={finishError}
        onDone={() => {
          setFinishing(null); setFinishError(null); setCompleting(false); setCardioStats(null);
          if (!finishError) { setCompleteResult(null); onNavigate('programs'); }
        }}
        onProgress={() => { setFinishing(null); setCompleteResult(null); setCompleting(false); setCardioStats(null); onNavigate('recommendations'); }}
      />
      </motion.div>
    );
  }

  // finishWorkout clears activeWorkout before the result arrives, so the
  // completion screen has to be checked first.
  if (completeResult) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <WorkoutComplete
        result={completeResult}
        duration={completeResult.duration}
        onClose={() => { setCompleteResult(null); setCompleting(false); setCardioStats(null); onNavigate('history'); }}
      />
      </motion.div>
    );
  }

  if (!activeWorkout && isQuest) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-full">
        <QuestTitle onNavigate={onNavigate} />
      </motion.div>
    );
  }
  if (!activeWorkout) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="g-root flex flex-col items-center justify-center gap-3 min-h-[60vh] text-center px-10">
        <div className="opacity-30 text-text-tertiary"><NavIcon id="workout" size={44} /></div>
        <div className="text-[22px] font-extrabold">No active workout</div>
        <div className="text-sm text-text-secondary">Pick a session from Programs to start training.</div>
        <button onClick={() => onNavigate('programs')} className="mt-2 h-[50px] px-[22px] rounded-[18px] bg-accent font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}>Browse programs</button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className={isFocus ? 'h-full' : 'pb-28'}>{/* room to scroll Finish/✕ clear of the floating rest timer */}
      {isFocus && (
        <FocusWorkout
          workout={activeWorkout}
          layout={workoutLayout}
          history={workoutHistory}
          elapsed={elapsed}
          handlers={cardHandlers}
          onSetComplete={handleSetComplete}
          updateWorkout={updateActiveWorkout}
          onFinish={() => { setShowFinish(true); setCardioStats(null); }}
          onCancel={() => setShowCancel(true)}
          onAddExercise={() => setShowAddExercise(true)}
        />
      )}
      {isFocus && countdown && <Countdown workout={activeWorkout} onDone={() => setCountdown(false)} />}
      {!isFocus && (<>
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-bg-0/90 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-base text-text-primary truncate">{activeWorkout.workoutName}</h1>
            <span className="text-[10px] text-text-tertiary font-mono">{activeWorkout.programName}</span>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Time</div>
            <div className="font-mono font-bold text-2xl leading-tight tabular-nums text-text-primary">{elapsed}</div>
          </div>
        </div>
      </div>

      {/* Exercise list — block-grid mode (strength-only workouts) */}
      {!reordering && useBlockGrid && (
        <BlockGridView
          exercises={activeWorkout.exercises}
          allHandlers={cardHandlers}
          onSetSupersetRest={handleSetSupersetRest}
        />
      )}

      {/* Exercise list — normal mode */}
      {!reordering && !useBlockGrid && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2 p-2">
          <AnimatePresence>
            {exerciseRows.map((row) => {
              // ── Supersets → one card holding every member ──────────────
              if (row.kind === 'superset') {
                const dimmed = anyTimerActive && !row.indices.some((i) => activeTimerIndices[i]);
                return (
                  <div
                    key={`ss-${row.indices.join('-')}`}
                    style={{
                      filter: dimmed ? 'grayscale(1) brightness(0.55)' : 'grayscale(0) brightness(1)',
                      transition: 'filter 0.35s ease',
                    }}
                  >
                    <SupersetCard
                      exercises={activeWorkout.exercises}
                      indices={row.indices}
                      onSetRestMode={handleSetSupersetRest}
                      onTimerActiveChange={handleTimerActiveChange}
                      {...cardHandlers}
                    />
                  </div>
                );
              }

              const ei = row.index;
              const exercise = activeWorkout.exercises[ei];
              const isTimerActive = !!activeTimerIndices[ei];
              const dimmed = anyTimerActive && !isTimerActive;

              // ── Cardio exercises → CardioCard (with timer, photo upload) ──
              const isCardio = exercise.type === 'cardio' || exercise.sets?.[0]?.type === 'cardio';
              const card = isCardio ? (
                <CardioCard
                  key={ei}
                  exercise={exercise}
                  exerciseIndex={ei}
                  onUpdateSet={handleUpdateSet}
                  onUpdateExercise={handleUpdateCardioExercise}
                  onTimerActiveChange={handleTimerActiveChange}
                />
              ) : (
                // ── Strength exercises → ExerciseCard ──
                <ExerciseCard
                  key={ei}
                  exercise={exercise}
                  exerciseIndex={ei}
                  allExercises={activeWorkout.exercises}
                  onTimerActiveChange={handleTimerActiveChange}
                  {...cardHandlers}
                />
              );

              return (
                <div
                  key={ei}
                  style={{
                    filter: dimmed ? 'grayscale(1) brightness(0.55)' : 'grayscale(0) brightness(1)',
                    transition: 'filter 0.35s ease',
                  }}
                >
                  {card}
                </div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Exercise list — reorder mode */}
      {reordering && (
        <div className="p-2 flex flex-col gap-1">
          <div className="px-2 py-1 text-[10px] font-mono text-accent uppercase tracking-wider">Reorder / Remove Exercises</div>
          {activeWorkout.exercises.map((exercise, ei) => (
            <motion.div
              key={`reorder-${ei}`}
              layout
              className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2.5"
            >
              <span className="text-text-muted text-xs select-none">☰</span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm text-text-primary truncate">{exercise.name}</div>
                <div className="text-[10px] text-text-tertiary font-mono">
                  {exercise.type === 'cardio' ? 'Cardio' : `${exercise.sets?.length || 0} sets · ${exercise.targetReps}`}
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleMoveUp(ei)} disabled={ei === 0}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs ${ei === 0 ? 'text-text-muted' : 'text-text-secondary bg-bg-3 border border-border active:bg-bg-4'}`}>↑</motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleMoveDown(ei)} disabled={ei === activeWorkout.exercises.length - 1}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs ${ei === activeWorkout.exercises.length - 1 ? 'text-text-muted' : 'text-text-secondary bg-bg-3 border border-border active:bg-bg-4'}`}>↓</motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleRemoveExercise(ei)} disabled={activeWorkout.exercises.length <= 1}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs ${activeWorkout.exercises.length <= 1 ? 'text-text-muted' : 'text-error/60 bg-error/5 border border-error/20 active:bg-error/15'}`}>✕</motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reorder toggle + Add Exercise */}
      <div className="flex gap-2 px-3 pt-1 pb-2">
        <Button variant={reordering ? 'primary' : 'ghost'} onClick={() => setReordering((r) => !r)} className="flex-1">
          {reordering ? 'Done' : 'Reorder'}
        </Button>
        {!reordering && (
          <Button variant="secondary" onClick={() => setShowAddExercise(true)} className="flex-1">+ Add Exercise</Button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 pt-1 pb-1">
        <Button variant="success" size="lg" onClick={() => { setShowFinish(true); setCardioStats(null); }} className="flex-1" disabled={completing}>
          {completing ? 'Saving...' : 'Finish Workout'}
        </Button>
        <Button variant="danger" onClick={() => setShowCancel(true)}>✕</Button>
      </div>
      </>)}

      

      {/* Finish Modal */}
      <AnimatePresence>
        {showFinish && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center px-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-bg-1 border border-border rounded-2xl p-5 max-w-sm w-full">
              <h3 className="font-display font-bold text-lg text-text-primary mb-1">Finish Workout?</h3>
              {activeWorkout?.startTime && (() => { const mins = Math.round((Date.now() - new Date(activeWorkout.startTime)) / 60000); return mins > 90 ? (<div className="mb-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning font-mono">Workout is {Math.floor(mins / 60)}h {mins % 60}m long — did you forget to end it?</div>) : null; })()}
              {(() => {
                const untouched = (activeWorkout?.exercises || []).filter((ex) => !ex.sets?.some((s) => s.completed)).length;
                return (
                  <p className="text-sm text-text-secondary mb-4">
                    Your workout will be saved and analyzed.
                    {untouched > 0 && <span className="block mt-1 text-warning">{untouched} exercise{untouched > 1 ? 's' : ''} not started yet.</span>}
                  </p>
                );
              })()}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCardioUpload} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCardioUpload} />
              <div className="mb-4">
                {!cardioStats && !cardioLoading && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider text-center">Upload Cardio Data</div>
                    <div className="flex gap-2">
                      <button onClick={() => cameraInputRef.current?.click()} className="flex-1 border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-accent/40 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto text-text-tertiary mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.174-1.26.207-2.152 1.304-2.152 2.582V16.5a2.25 2.25 0 0 0 2.25 2.25h15.75A2.25 2.25 0 0 0 22 16.5V9.986c0-1.278-.892-2.375-2.152-2.582a45.32 45.32 0 0 0-1.134-.174 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.823 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>
                        <div className="text-[10px] font-mono text-text-secondary">Take Photo</div>
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="flex-1 border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-accent/40 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto text-text-tertiary mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 0 3Z" /></svg>
                        <div className="text-[10px] font-mono text-text-secondary">Upload Image</div>
                      </button>
                    </div>
                    <div className="text-[10px] text-text-muted leading-relaxed text-center">From Apple Watch, Garmin, Fitbit, Samsung Health, or a photo of your treadmill/bike display</div>
                  </div>
                )}
                {cardioLoading && (
                  <div className="w-full border-2 border-dashed border-border rounded-xl p-4 text-center">
                    <div className="text-xs text-text-secondary animate-pulse">Extracting stats...</div>
                  </div>
                )}
                {cardioStats && !cardioLoading && (
                  <div className="w-full border-2 border-solid border-success/40 rounded-xl p-3">
                    <div className="text-[10px] font-mono text-success uppercase tracking-wider mb-2">Stats Extracted</div>
                    {CARDIO_FIELDS.map((f) => {
                      const val = cardioStats[f.key];
                      if (val == null) return null;
                      return <div key={f.key} className="flex justify-between text-xs"><span className="text-text-tertiary">{f.label}</span><span className="text-text-primary font-mono">{val}{f.suffix || ''}</span></div>;
                    })}
                    <button onClick={() => setCardioStats(null)} className="mt-2 text-[10px] font-mono text-text-tertiary hover:text-error">✕ Remove</button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setShowFinish(false)} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={handleConfirmFinish} className="flex-1" disabled={cardioLoading}>Finish</Button>
              </div>
              <button onClick={handleFinishEarly} disabled={cardioLoading} className="w-full mt-2 text-xs font-mono text-text-tertiary hover:text-text-secondary transition-colors py-1">Finish Early (skip variation check)</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel confirm */}
      <ConfirmDialog open={showCancel} title="Cancel Workout?" message="All progress for this session will be lost." onConfirm={handleCancel} onCancel={() => setShowCancel(false)} confirmLabel="Cancel Workout" cancelLabel="Keep training" danger />

      {/* Variation prompt */}
      <AnimatePresence>
        {variationData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center px-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-bg-1 border border-border rounded-2xl p-5 max-w-sm w-full">
              <h3 className="font-display font-bold text-lg text-text-primary mb-2">Save as Variation?</h3>
              <p className="text-sm text-text-secondary mb-1">You modified "{variationData.originalWorkoutName}":</p>
              <p className="text-xs text-accent font-mono mb-4">{variationData.changeDescription}</p>
              <div className="flex flex-col gap-2">
                <Button variant="primary" onClick={() => handleVariationDecision(true)} className="w-full">Save as Variation</Button>
                <Button variant="secondary" onClick={() => handleVariationDecision(false)} className="w-full">Just Finish</Button>
                <Button variant="ghost" onClick={() => setVariationData(null)} className="w-full text-text-tertiary">Go Back</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Exercise Modal */}
      <Modal open={showAddExercise} onClose={() => setShowAddExercise(false)} title="Add Exercise">
        <div className="p-4 flex flex-col gap-3">
          <input type="text" value={newExName} onChange={(e) => setNewExName(e.target.value)} placeholder="Exercise name" list={EXERCISE_LIST_ID} className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50" autoFocus />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] font-mono text-text-tertiary">SETS</span>
              <input type="number" value={newExSets} onChange={(e) => setNewExSets(parseInt(e.target.value) || 3)} className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-text-tertiary">REPS</span>
              <input type="text" value={newExReps} onChange={(e) => setNewExReps(e.target.value)} className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-text-tertiary">REST (s)</span>
              <input type="number" value={newExRest} onChange={(e) => setNewExRest(parseInt(e.target.value) || 90)} className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowAddExercise(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={handleAddExercise} className="flex-1">Add</Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

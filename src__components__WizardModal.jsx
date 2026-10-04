import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { pageVariants } from '../lib/variants';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useBackHandler from '../hooks/useBackHandler';
import ThinkingDots from './ThinkingDots';
import * as api from '../lib/api';

const STEPS = ['Name', 'Schedule', 'Equipment', 'Details', 'AI Chat'];

export default function WizardModal({ open, onClose }) {
  const { reloadPrograms } = useWorkout();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const chatRef = useRef(null);

  // Form state
  const [name, setName] = useState('');
  const [split, setSplit] = useState('push-pull-legs');
  const [days, setDays] = useState('3');
  const [duration, setDuration] = useState('60');
  const [equipment, setEquipment] = useState({ barbell: true, dumbbells: true, machines: true, cables: true, bodyweight: true });
  const [goal, setGoal] = useState('hypertrophy');
  const [repRange, setRepRange] = useState('hypertrophy');
  const [experience, setExperience] = useState('intermediate');
  // New fields from AI Gains legacy
  const [trainingPref, setTrainingPref] = useState('mixed');
  const [intensity, setIntensity] = useState('moderate');
  const [cardio, setCardio] = useState('none');
  const [setsPerExercise, setSetsPerExercise] = useState('4');
  const [restTime, setRestTime] = useState('medium');
  const [avoidExercises, setAvoidExercises] = useState('');
  const [preferredExercises, setPreferredExercises] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Chat state
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const buildSummary = useCallback(() => {
    const eqList = Object.entries(equipment).filter(([, v]) => v).map(([k]) => k);
    let summary = `Program: ${name}\nSplit: ${split}\nFrequency: ${days} days/week\nDuration: ${duration} min/session\nEquipment: ${eqList.join(', ')}\nGoal: ${goal}\nRep Range: ${repRange}\nExperience: ${experience}`;
    summary += `\nTraining Preference: ${trainingPref}\nIntensity: ${intensity}\nCardio: ${cardio}`;
    summary += `\nSets per Exercise: ${setsPerExercise}\nRest Time: ${restTime}`;
    if (avoidExercises.trim()) summary += `\nExercises to Avoid: ${avoidExercises}`;
    if (preferredExercises.trim()) summary += `\nPreferred Exercises: ${preferredExercises}`;
    if (additionalNotes.trim()) summary += `\nAdditional Notes: ${additionalNotes}`;
    return summary;
  }, [name, split, days, duration, equipment, goal, repRange, experience, trainingPref, intensity, cardio, setsPerExercise, restTime, avoidExercises, preferredExercises, additionalNotes]);

  useEffect(() => {
    if (step === 4 && chatHistory.length === 0) initChat();
  }, [step]); // eslint-disable-line

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatHistory]);

  const initChat = async () => {
    setChatLoading(true);
    try {
      const result = await api.wizardInit(buildSummary());
      if (result.success) {
        setChatHistory([{ role: 'assistant', content: result.response }]);
      }
    } catch {
      setChatHistory([{ role: 'assistant', content: 'Error initializing. Please try again.' }]);
    }
    setChatLoading(false);
  };

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const newHistory = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);
    try {
      const result = await api.wizardChat(newHistory, buildSummary());
      if (result.success) {
        setChatHistory((prev) => [...prev, { role: 'assistant', content: result.response }]);
      }
    } catch {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: 'Error. Please try again.' }]);
    }
    setChatLoading(false);
  }, [chatInput, chatHistory, chatLoading, buildSummary]);

  const handleGenerate = useCallback(async () => {
    if (!name.trim()) return showToast('Enter a program name', 'error');
    setGenerating(true);
    try {
      const desc = buildSummary() + '\n\nChat conversation:\n' +
        chatHistory.map((m) => m.role + ': ' + m.content).join('\n');

      const response = await fetch('/api/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: desc }),
      });
      const data = await response.json();

      if (data.success && data.program) {
        await api.createProgram(data.program.name, data.program.workouts);
        await reloadPrograms();
        showToast('Program created!', 'success');
        handleClose();
      } else {
        showToast(data.error || 'Generation failed', 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setGenerating(false);
  }, [name, chatHistory, buildSummary, reloadPrograms, showToast]);

  const handleClose = useCallback(() => {
    setStep(0);
    setName('');
    setChatHistory([]);
    setChatInput('');
    setAvoidExercises('');
    setPreferredExercises('');
    setAdditionalNotes('');
    onClose();
  }, [onClose]);

  // Back gesture: if not on step 0, step back through wizard steps.
  // Returning false lets Modal's own back handler close the whole modal
  // (which happens when step === 0).
  useBackHandler(open, useCallback(() => {
    if (step > 0) {
      setChatHistory(step === 4 ? [] : chatHistory);
      setStep((s) => s - 1);
      return true;
    }
    return false;
  }, [step, chatHistory]));

  const toggleEquipment = (key) => setEquipment((prev) => ({ ...prev, [key]: !prev[key] }));

  const Select = ({ label, value, onChange, children }) => (
    <div>
      <label className="text-xs font-mono text-text-tertiary mb-1 block">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none">{children}</select>
    </div>
  );

  return (
    <Modal open={open} onClose={handleClose} title={`Create Program — Step ${step + 1} of ${STEPS.length}`} maxWidth="max-w-xl">
      <div className="p-4">
        <AnimatePresence>
          {generating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/10 border border-accent/20">
                <ThinkingDots className="text-accent" />
                <span className="text-xs font-mono text-accent">AI is building your program…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Progress indicator */}
        <div className="flex gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-bg-4'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Name */}
          {step === 0 && (
            <motion.div key="s1" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <h3 className="font-display font-semibold text-lg text-text-primary mb-4">Program Name</h3>
              <input type="text" placeholder="e.g. Push Pull Legs, Upper Lower..." value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50" autoFocus />
            </motion.div>
          )}

          {/* Step 2: Schedule */}
          {step === 1 && (
            <motion.div key="s2" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-4">
              <Select label="Training Split" value={split} onChange={setSplit}>
                <option value="push-pull-legs">Push / Pull / Legs</option>
                <option value="upper-lower">Upper / Lower</option>
                <option value="full-body">Full Body</option>
                <option value="bro-split">Bro Split (1 muscle/day)</option>
                <option value="custom">Custom</option>
              </Select>
              <Select label="Days Per Week" value={days} onChange={setDays}>
                {[2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select>
              <Select label="Session Duration" value={duration} onChange={setDuration}>
                {[30, 45, 60, 75, 90].map((d) => <option key={d} value={d}>{d} minutes</option>)}
              </Select>
            </motion.div>
          )}

          {/* Step 3: Equipment */}
          {step === 2 && (
            <motion.div key="s3" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <h3 className="font-display font-semibold text-lg text-text-primary mb-4">Available Equipment</h3>
              <div className="flex flex-col gap-2">
                {[['barbell', 'Barbells'], ['dumbbells', 'Dumbbells'], ['machines', 'Machines'], ['cables', 'Cables'], ['bodyweight', 'Bodyweight']].map(([key, label]) => (
                  <motion.button key={key} whileTap={{ scale: 0.97 }} onClick={() => toggleEquipment(key)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      equipment[key] ? 'border-accent/40 bg-accent-muted text-text-primary' : 'border-border bg-bg-2 text-text-tertiary'
                    }`}>
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${equipment[key] ? 'bg-accent text-white' : 'bg-bg-4'}`}>
                      {equipment[key] ? '✓' : ''}
                    </span>
                    <span className="text-sm">{label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Details (expanded with all legacy fields) */}
          {step === 3 && (
            <motion.div key="s4" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
              <Select label="Primary Goal" value={goal} onChange={setGoal}>
                <option value="hypertrophy">Muscle Growth (Hypertrophy)</option>
                <option value="strength">Strength</option>
                <option value="endurance">Muscular Endurance</option>
                <option value="athletic">Athletic Performance</option>
              </Select>
              <Select label="Rep Range" value={repRange} onChange={setRepRange}>
                <option value="strength">Low (3-5) — Strength</option>
                <option value="hypertrophy">Medium (8-12) — Hypertrophy</option>
                <option value="endurance">High (15+) — Endurance</option>
                <option value="mixed">Mixed</option>
              </Select>
              <Select label="Experience Level" value={experience} onChange={setExperience}>
                <option value="beginner">Beginner (0-1 year)</option>
                <option value="intermediate">Intermediate (1-3 years)</option>
                <option value="advanced">Advanced (3+ years)</option>
              </Select>
              <Select label="Training Preference" value={trainingPref} onChange={setTrainingPref}>
                <option value="compound">Compound Focused</option>
                <option value="isolation">Isolation Focused</option>
                <option value="mixed">Mixed</option>
              </Select>
              <Select label="Intensity" value={intensity} onChange={setIntensity}>
                <option value="low">Low — Easy sessions</option>
                <option value="moderate">Moderate — Standard</option>
                <option value="high">High — Intense</option>
              </Select>
              <Select label="Cardio" value={cardio} onChange={setCardio}>
                <option value="none">None</option>
                <option value="light">Light (5-10 min warmup)</option>
                <option value="moderate">Moderate (15-20 min)</option>
                <option value="heavy">Heavy (30+ min)</option>
              </Select>
              <Select label="Sets Per Exercise" value={setsPerExercise} onChange={setSetsPerExercise}>
                <option value="3">3 sets</option>
                <option value="4">4 sets</option>
                <option value="5">5 sets</option>
              </Select>
              <Select label="Rest Time Between Sets" value={restTime} onChange={setRestTime}>
                <option value="short">Short (60-90s)</option>
                <option value="medium">Medium (2-3min)</option>
                <option value="long">Long (3-5min)</option>
                <option value="variable">Variable</option>
              </Select>
              <div>
                <label className="text-xs font-mono text-text-tertiary mb-1 block">Exercises to Avoid</label>
                <input type="text" value={avoidExercises} onChange={(e) => setAvoidExercises(e.target.value)} placeholder="e.g. Deadlift, Behind-the-neck press"
                  className="w-full bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none" />
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary mb-1 block">Preferred Exercises</label>
                <input type="text" value={preferredExercises} onChange={(e) => setPreferredExercises(e.target.value)} placeholder="e.g. Incline bench, RDL"
                  className="w-full bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none" />
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary mb-1 block">Additional Notes</label>
                <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Any injuries, preferences, or goals..."
                  rows={2} className="w-full bg-bg-0 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none resize-none" />
              </div>
            </motion.div>
          )}

          {/* Step 5: AI Chat */}
          {step === 4 && (
            <motion.div key="s5" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col" style={{ height: '50vh' }}>
              <div ref={chatRef} className="flex-1 overflow-y-auto mb-3 space-y-3">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user' ? 'bg-accent text-white rounded-br-md' : 'bg-bg-2 text-text-primary border border-border rounded-bl-md'
                    }`}>{msg.content}</div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-bg-2 border border-border rounded-2xl rounded-bl-md px-4 py-3 text-text-tertiary flex items-center gap-2">
                      <ThinkingDots />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Ask about equipment, swaps..."
                  className="flex-1 bg-bg-0 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none" />
                <Button variant="primary" onClick={sendChat} disabled={chatLoading}>Send</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          {step > 0 && <Button variant="ghost" onClick={() => { setChatHistory(step === 4 ? [] : chatHistory); setStep((s) => s - 1); }} className="flex-1">Back</Button>}
          {step < 4 && (
            <Button variant="primary" onClick={() => { if (step === 0 && !name.trim()) return showToast('Enter a name', 'error'); setStep((s) => s + 1); }}
              className={step > 0 ? 'flex-[2]' : 'flex-1'}>Next</Button>
          )}
          {step === 4 && (
            <Button variant="primary" onClick={handleGenerate} disabled={generating} className="flex-[2]">
              {generating ? <span className="flex items-center justify-center gap-2">Generating <ThinkingDots /></span> : 'Generate Program'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

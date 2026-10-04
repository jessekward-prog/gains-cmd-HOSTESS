import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../lib/api';
import ThinkingDots from './ThinkingDots';
import { useWorkout } from '../context/WorkoutContext';

export default function ExerciseNotes({ exerciseName, exerciseTarget, onClose }) {
  const [notes, setNotes] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryOffer, setRecoveryOffer] = useState(null); // the note text the AI offered to save
  const { setRecoveryNote } = useWorkout();
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [notes]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userNote = { role: 'user', content: text };
    const updated = [...notes, userNote];
    setNotes(updated);
    setInput('');
    setLoading(true);

    try {
      const data = await api.exerciseNotes(exerciseName, exerciseTarget, text, updated.slice(-10));
      if (data.success) {
        setNotes((prev) => [...prev, { role: 'assistant', content: data.response }]);
        setRecoveryOffer(data.isRecoveryFlagged ? text : null);
      }
    } catch {
      setNotes((prev) => [...prev, { role: 'assistant', content: 'Error getting response.' }]);
    }
    setLoading(false);
  }, [input, notes, loading, exerciseName, exerciseTarget]);

  const answerRecovery = useCallback(async (save) => {
    const note = recoveryOffer;
    setRecoveryOffer(null);
    if (!save) return;
    try {
      await api.setRecoveryStatus(exerciseName, 'active', note);
      setRecoveryNote(exerciseName, note);
      setNotes((prev) => [...prev, { role: 'assistant', content: "Saved. I'll show it on this exercise next session." }]);
    } catch {
      setNotes((prev) => [...prev, { role: 'assistant', content: "Couldn't save the recovery note — try again." }]);
    }
  }, [recoveryOffer, exerciseName, setRecoveryNote]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="border-t border-border pt-2 mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">AI Notes</span>
          <button onClick={onClose} className="text-[10px] text-text-muted hover:text-text-secondary">✕ Close</button>
        </div>

        {/* Messages */}
        <div ref={chatRef} className="max-h-40 overflow-y-auto mb-2 flex flex-col gap-1.5">
          {notes.length === 0 && (
            <div className="text-[10px] text-text-muted py-2 text-center">Ask about form, technique, or alternatives</div>
          )}
          {notes.map((note, i) => (
            <div key={i} className={`px-2.5 py-1.5 rounded-lg text-xs leading-relaxed ${
              note.role === 'user'
                ? 'bg-bg-4 text-text-primary self-end ml-6'
                : 'bg-success-muted text-text-primary self-start mr-6'
            }`}>
              <span className="font-bold text-[9px] mr-1">{note.role === 'user' ? 'You:' : 'AI:'}</span>
              {note.content}
            </div>
          ))}
          {loading && (
            <div className="px-2.5 py-2 rounded-lg bg-bg-3 self-start flex items-center gap-2 text-text-tertiary text-xs">
              <ThinkingDots size="sm" />
              <span>Thinking</span>
            </div>
          )}
        </div>

        {recoveryOffer && (
          <div className="flex gap-1.5 mb-2">
            <button onClick={() => answerRecovery(true)} className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-warning-muted border border-warning/40 text-warning">
              Save recovery note
            </button>
            <button onClick={() => answerRecovery(false)} className="px-3 py-1.5 rounded-lg text-xs border border-border text-text-tertiary">
              No thanks
            </button>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this exercise..."
            className="flex-1 bg-bg-0 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent/40"
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </motion.div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Button from './Button';
import useBackHandler from '../hooks/useBackHandler';

function Confetti() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
    color: ['#ff2222', '#22c55e', '#fbbf24', '#3b82f6', '#a855f7'][Math.floor(Math.random() * 5)],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}%`, opacity: 1, rotate: 0 }}
          animate={{
            y: '100vh',
            opacity: [1, 1, 0],
            rotate: p.rotation + 360,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size > 7 ? '50%' : '1px',
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

export default function WorkoutComplete({ result, duration, onClose }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
  }, []);

  // Android back gesture dismisses the completion screen.
  useBackHandler(show, onClose);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <Confetti />

          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.2 }}
            className="relative w-[90%] max-w-sm bg-bg-1 border border-border-strong rounded-2xl p-6 text-center"
          >
            {/* Trophy */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
              className="text-6xl mb-4"
            >
              🏆
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="font-display font-bold text-2xl text-text-primary mb-2"
            >
              Workout Complete!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="font-mono text-sm text-text-secondary mb-4"
            >
              {duration} minutes
            </motion.p>

            {result?.workout?.notes && !result.workout.notes.includes('AI_ANALYSIS_PENDING') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="text-left bg-bg-2 rounded-xl p-4 mb-4 text-sm text-text-secondary leading-relaxed"
              >
                {result.workout.notes}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <Button onClick={onClose} variant="primary" size="lg" className="w-full">
                Continue
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

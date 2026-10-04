import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHeaderMessage } from '../context/HeaderMessageContext';

const CHAR_DELAY = 25;
const HOLD_TIME = 2500;

export default function AppHeader() {
  const { message, onMessageComplete } = useHeaderMessage();
  const [displayText, setDisplayText] = useState('');
  const [showFlash, setShowFlash] = useState(false);
  const [showStrip, setShowStrip] = useState(false);
  const animRef = useRef(null);

  useEffect(() => {
    if (!message) return;
    if (animRef.current) clearTimeout(animRef.current);

    setShowStrip(true);
    setShowFlash(true);
    animRef.current = setTimeout(() => {
      setShowFlash(false);
      setDisplayText('');
      let i = 0;
      function typeMessage() {
        if (i <= message.length) {
          setDisplayText(message.slice(0, i));
          i++;
          animRef.current = setTimeout(typeMessage, CHAR_DELAY);
        } else {
          animRef.current = setTimeout(() => {
            setShowFlash(true);
            animRef.current = setTimeout(() => {
              setShowFlash(false);
              setDisplayText('');
              setShowStrip(false);
              onMessageComplete();
            }, 200);
          }, HOLD_TIME);
        }
      }
      typeMessage();
    }, 200);

    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [message]); // eslint-disable-line

  // The Focus redesign drops the banner from the header — each page carries its
  // own title. The banner image lives on in the boot splash. This strip only
  // shows the typewriter status messages.
  return (
    <div className="bg-bg-0 safe-area-top">
      <div className="max-w-2xl mx-auto">
        <AnimatePresence>
          {showStrip && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-4 py-2 font-mono text-sm">
                <span className="text-accent opacity-70">&gt;</span>
                <span className={`transition-all ${showFlash ? 'bg-accent text-bg-0 px-0.5' : 'text-text-primary'}`}>
                  {displayText}
                </span>
                <span className="text-accent animate-cursor-blink">_</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

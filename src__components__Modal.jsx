import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { overlayVariants, modalVariants } from '../lib/variants';
import useBackHandler from '../hooks/useBackHandler';

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  // Close on Android back gesture / browser back while open.
  useBackHandler(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full ${maxWidth} max-h-[90vh] bg-bg-1 border border-border-strong rounded-2xl overflow-hidden flex flex-col`}
          >
            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-display font-semibold text-lg text-text-primary">{title}</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="tap-target flex items-center justify-center text-text-tertiary hover:text-text-primary text-xl"
                >
                  ✕
                </motion.button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

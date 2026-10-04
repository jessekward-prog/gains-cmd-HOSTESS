import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './Button';
import { overlayVariants, modalVariants } from '../lib/variants';
import useBackHandler from '../hooks/useBackHandler';

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  // Android back gesture dismisses (treats as Cancel — never auto-confirms).
  useBackHandler(open, onCancel);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-bg-1 border border-border-strong rounded-2xl p-6"
          >
            <h3 className="font-display font-semibold text-lg text-text-primary mb-2">{title}</h3>
            <p className="text-sm text-text-secondary mb-6">{message}</p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onCancel} className="flex-1">{cancelLabel}</Button>
              <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} className="flex-1">
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

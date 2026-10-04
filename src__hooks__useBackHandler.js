import { useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';

/**
 * useBackHandler
 *
 * Intercept the Android back gesture / browser back button while a
 * component is active. Useful for modals, drawers, wizards, etc.
 *
 * Usage:
 *   useBackHandler(isOpen, () => {
 *     closeModal();
 *     return true; // we handled it — don't navigate
 *   });
 *
 * Return `true` if you handled the back event; `false` (or nothing)
 * to let the navigation continue normally.
 *
 * @param {boolean} active  Whether the handler should be registered.
 * @param {() => boolean|void} handler  Called on back; return true if handled.
 */
export default function useBackHandler(active, handler) {
  const { registerBackHandler } = useNavigation();

  useEffect(() => {
    if (!active) return;
    const unregister = registerBackHandler(() => {
      const result = handler();
      return result !== false; // default: assume handled if no return value
    });
    return unregister;
  }, [active, handler, registerBackHandler]);
}

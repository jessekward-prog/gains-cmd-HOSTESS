// Lightweight haptic feedback helpers. Feature-detects navigator.vibrate
// and silently no-ops on iOS Safari (which blocks the API) and on devices
// without vibration hardware.
const canVibrate = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function useHaptics() {
  return {
    // Single short pulse — for set completion, button taps.
    tap: () => { if (canVibrate()) navigator.vibrate(15); },
    // Triple pulse — for Level Up, PRs, milestone moments.
    success: () => { if (canVibrate()) navigator.vibrate([20, 40, 30, 40, 60]); },
  };
}

// Text another app shared into the Android app, waiting for the screen it was sent to. Read once, then gone.
export function takeShare(read = true) {
  try {
    const v = sessionStorage.getItem('gains-beta-share') || '';
    if (read && v) sessionStorage.removeItem('gains-beta-share');
    return v;
  } catch { return ''; }
}

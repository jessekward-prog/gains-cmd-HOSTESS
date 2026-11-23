// The link to the Android app (~/gains-cmd-android). Chrome hands the page a message port when it is running
// inside the APK; a browser or the installed PWA never gets one, so everything here is inert there.
const HELLO = 'gains-native:1';
let port = null;
const subs = new Set();
const ready = new Set();

export const native = {
  get on() { return !!port; },
  send(msg) { try { port?.postMessage(JSON.stringify(msg)); } catch { /* app went away */ } },
  /** fn(msg) for every message from the app. Returns an unsubscribe. */
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  /** fn() each time the app connects (and now, if it already has). Returns an unsubscribe. */
  onReady(fn) { ready.add(fn); if (port) fn(); return () => ready.delete(fn); },
};

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    // Only our own origin may offer a port: asset links let the app speak as this site, and nobody else can.
    if (e.origin !== window.location.origin || e.data !== HELLO || !e.ports?.[0]) return;
    port = e.ports[0];
    port.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg && typeof msg.t === 'string') subs.forEach((fn) => fn(msg));
    };
    ready.forEach((fn) => fn());
  });
}

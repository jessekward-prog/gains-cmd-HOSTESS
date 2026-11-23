// The link to the Android app (~/gains-cmd-android). Chrome hands the page a message port when it is running
// inside the APK; a browser or the installed PWA never gets one, so everything here is inert there.
// Chrome names a verified app like this (OriginVerifier.getPostMessageUriFromVerifiedOrigin), and its first message
// is empty apart from the port.
const APP = typeof window !== 'undefined' && `android-app://${window.location.hostname}/xyz.cmdward.gains`;
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
    if (e.origin !== APP || !e.ports?.[0]) return;
    port = e.ports[0];
    port.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg && typeof msg.t === 'string') subs.forEach((fn) => fn(msg));
    };
    native.send({ t: 'hello' }); // the app keeps offering until it hears this
    ready.forEach((fn) => fn());
  });
  // A notification button pressed while the page was hidden may not have reached it.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) native.send({ t: 'sync' }); });
}

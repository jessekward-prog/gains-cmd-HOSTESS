// The link to the Android app (~/gains-cmd-android). Chrome hands the page a message port when it is running
// inside the APK; a browser or the installed PWA never gets one, so everything here is inert there.
// Chrome gives a verified app this origin (seen on Chrome 152: host only, no package) and an empty first message.
const APP = typeof window !== 'undefined' && `android-app://${window.location.hostname}`;
let port = null;
let rings = false; // until the app says its notifications can sound, this page does the beeping
let blocked = false; // Android is hiding the app's notifications
const subs = new Set();
const ready = new Set();

export const native = {
  get on() { return !!port; },
  get rings() { return !!port && rings; },
  get blocked() { return !!port && blocked; },
  send(msg) { try { port?.postMessage(JSON.stringify(msg)); } catch { /* app went away */ } },
  /** fn(msg) for every message from the app. Returns an unsubscribe. */
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  /** fn() each time the app connects (and now, if it already has). Returns an unsubscribe. */
  onReady(fn) { ready.add(fn); if (port) fn(); return () => ready.delete(fn); },
};

if (typeof window !== 'undefined') {
  const take = (p) => {
    port = p;
    rings = blocked = false;
    port.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg?.t === 'can-ring') { rings = msg.v === true; blocked = msg.n === false; }
      if (msg && typeof msg.t === 'string') subs.forEach((fn) => fn(msg));
    };
    native.send({ t: 'hello' }); // the app keeps offering until it hears this
    ready.forEach((fn) => fn());
  };
  window.addEventListener('message', (e) => { if (e.origin === APP && e.ports?.[0]) take(e.ports[0]); });
  if (window.__gainsPort) take(window.__gainsPort); // offered before this module loaded (main.jsx)
  // A notification button pressed while the page was hidden may not have reached it.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) native.send({ t: 'sync' }); });
}

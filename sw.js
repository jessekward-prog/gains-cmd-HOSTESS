const CACHE_NAME = 'gains-cmd-v9';

// Sounds that must play the instant they're called: stored at install, then
// always answered from the phone, never the network.
const INSTANT = ['/slow-down.mp3'];
// Shown from the phone straight away, then refreshed for the next open.
const SPLASH = '/boot-splash.html';

// Stores the newest page, but only once every build file it can ask for is stored too: after a deploy the server
// answers a missing old file with the page's own HTML, so a page saved without its files would open to nothing.
// ponytail: files of past builds stay until CACHE_NAME changes; prune here if that grows.
async function saveShell() {
  const cache = await caches.open(CACHE_NAME);
  const page = await fetch('/', { cache: 'no-cache' });
  const html = await page.clone().text();
  if (!page.ok || page.redirected || !html.includes('id="root"')) return;
  const seen = new Set();
  const store = async (text) => {
    const names = [...text.matchAll(/(?:assets\/|["'`]\.\/)([\w.-]+-[\w-]{8}\.(?:js|css|jpe?g|png|svg|webp|woff2))\b/g)].map((m) => `/assets/${m[1]}`);
    await Promise.all(names.filter((n) => !seen.has(n) && seen.add(n)).map(async (name) => {
      let file = await cache.match(name);
      if (!file) {
        file = await fetch(name);
        if (!file.ok || file.headers.get('content-type')?.includes('text/html')) {
          if (/\.(js|css)$/.test(name)) throw new Error(`missing ${name}`);
          return;
        }
        await cache.put(name, file.clone());
      }
      if (/\.(js|css)$/.test(name)) await store(await file.text());
    }));
  };
  await store(html);
  await cache.put('/', page);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...INSTANT, SPLASH])),
    saveShell(),
  ]).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  // Never a Range request: a cached 200 answering one breaks <audio> seeking.
  if (INSTANT.includes(url.pathname) && !event.request.headers.has('range')) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(event.request)));
    return;
  }

  if (url.pathname === SPLASH) {
    const fresh = fetch(event.request).then((response) => {
      if (!response.ok) return response;
      const clone = response.clone();
      return caches.open(CACHE_NAME).then((cache) => cache.put(SPLASH, clone)).then(() => response);
    });
    event.waitUntil(fresh.catch(() => {}));
    event.respondWith(caches.match(SPLASH).then((hit) => hit || fresh));
    return;
  }

  // The app itself opens from the phone (no wait on Railway) and the next open gets what was fetched meanwhile.
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    const saved = saveShell();
    event.waitUntil(saved.catch(() => {}));
    event.respondWith(caches.match('/').then((hit) => hit || fetch(event.request)));
    return;
  }

  // Build files carry a hash in their name, so a stored one never goes stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(event.request)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.mp3')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

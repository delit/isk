/* ISK PWA — bumpa "version" i version.json vid publicering. */
const CHART_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

function base() {
  return new URL('./', self.location.href);
}
function toUrl(path) {
  return new URL(path, base()).href;
}

let cacheNameStatic = null;

async function readCacheName() {
  let v = '1.0.0';
  try {
    const r = await fetch(toUrl('version.json'), { cache: 'no-store' });
    const j = await r.json();
    v = String(j.version || v).replace(/[^a-zA-Z0-9._-]/g, '');
  } catch (e) {
    /* nätverk / första laddning */
  }
  return `isk-calc-${v}`;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      cacheNameStatic = await readCacheName();
      const cache = await caches.open(cacheNameStatic);
      const list = [
        toUrl('index.html'),
        toUrl('styles.css'),
        toUrl('app.js'),
        toUrl('pwa.js'),
        toUrl('manifest.json'),
        toUrl('version.json'),
        toUrl('icons/icon.svg'),
        toUrl('icons/icon-192.png'),
        toUrl('icons/icon-512.png'),
        CHART_CDN
      ];
      for (const u of list) {
        try {
          await cache.add(u);
        } catch (e) {
          /* ok vid offline */
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (!cacheNameStatic) {
        cacheNameStatic = await readCacheName();
      }
      const name = cacheNameStatic;
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('isk-calc-') && k !== name)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (new URL(request.url).pathname.endsWith('version.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            if (cacheNameStatic) {
              caches
                .open(cacheNameStatic)
                .then((c) => c.put(request, copy));
            }
          }
          return res;
        })
        .catch(() => caches.match(toUrl('index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200 && cacheNameStatic) {
          const copy = res.clone();
          caches
            .open(cacheNameStatic)
            .then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

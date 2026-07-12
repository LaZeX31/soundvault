const CACHE = 'soundvault-v4';
const ASSETS = [
  '/soundvault/',
  '/soundvault/index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Seules les requêtes GET peuvent être mises en cache (le Cache API ne supporte pas
  // POST/PUT/DELETE). On laisse ces requêtes (ex: envois vers Supabase) passer
  // directement au réseau, sans interception.
  if (req.method !== 'GET') return;

  // On ne gère que les fichiers de l'app elle-même : les requêtes vers un autre domaine
  // (Supabase, CDN Supabase-js, fonts Google...) partent directement au réseau, sans cache,
  // pour éviter de servir des données obsolètes (musiques, playlists, session...).
  if (new URL(req.url).origin !== self.location.origin) return;

  // Pages HTML : toujours essayer le réseau en premier pour avoir la dernière
  // version déployée. Le cache ne sert que de secours si hors-ligne.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('/soundvault/index.html'))
        )
    );
    return;
  }

  // Le reste (icônes, styles, etc.) : cache d'abord pour la vitesse,
  // réseau en secours, et on met à jour le cache au passage.
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

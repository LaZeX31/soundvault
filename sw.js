// SoundVault — Service Worker
// Rôle : rendre l'app installable et utilisable hors-ligne (page + icônes).
// Les musiques (IndexedDB), Supabase et le worker de stockage ne sont JAMAIS
// interceptés ici : on ne touche qu'à la coquille de l'app, en same-origin.

const CACHE_NAME = 'soundvault-v1';
const CORE_ASSETS = [
  '/soundvault/',
  '/soundvault/index.html',
  '/soundvault/manifest.json',
  '/soundvault/icon-192.png',
  '/soundvault/icon-512.png'
];

// ── INSTALL : met en cache la coquille de l'app ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll échouerait entièrement si un seul fichier manque (ex: icon-512.png
      // pas encore ajouté) : on met donc chaque fichier en cache individuellement.
      Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('SW: échec mise en cache de', url, err))
        )
      )
    )
  );
});

// ── ACTIVATE : nettoie les anciens caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne gère que le GET, et uniquement les requêtes vers notre propre origine.
  // Tout le reste (Supabase, worker de stockage B2, polices Google, CDN Supabase-js...)
  // part directement sur le réseau, sans passer par le cache.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (chargement/rechargement de la page) : réseau en priorité,
  // avec repli sur le cache si hors-ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/soundvault/index.html'))
        )
    );
    return;
  }

  // Autres ressources same-origin (manifest, icônes) : cache en priorité,
  // avec récupération réseau en arrière-plan pour rester à jour.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

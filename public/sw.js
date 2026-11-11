// Organizér – service worker: aplikácia sa otvorí aj bez internetu.
// Stránka: najprv sieť, pri výpadku posledná uložená verzia. Súbory /assets/ majú v názve hash → cache.
const CACHE = 'organizer-v1'
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/icon.svg'])).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // Supabase ide vždy priamo
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/') || /\.(svg|png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return r })))
  }
})

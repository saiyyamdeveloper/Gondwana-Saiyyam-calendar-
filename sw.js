/* Gondwana Calendar App — offline service worker */
const CACHE = 'gondwana-v4';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'engine.js', 'data.js', 'converter.js', 'validate.js',
  'NotoSansMasaramGondi.woff2', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'mahapurush_database.json', 'gondwana_places.json',
  'Aadivasi_Mahapurush_Starter_Database.csv', 'Gondwana_Places_GPS.csv'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (_) {} });
      return res;
    }).catch(() => caches.match('index.html')))
  );
});

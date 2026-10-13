// 앱 껍데기만 캐시(네트워크 우선). 데이터는 항상 서버에서.
const CACHE = 'godsaeng-v4';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // no-cache: GitHub Pages 의 10분 HTTP 캐시를 건너뛰고 항상 서버에 새 버전이 있는지 확인
  e.respondWith(fetch(e.request.url, {cache: 'no-cache'}).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

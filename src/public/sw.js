// 네트워크 우선, 오프라인일 때만 저장본. 빌드 파일 이름에 해시가 붙어 옛 코드가 섞이지 않음.
const CACHE = 'godsaeng-v5', SHARE = 'share';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname.endsWith('/share')) return e.respondWith(share(e.request));
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' })
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
// 다른 앱에서 '공유 → 갓생살기': 사진·글을 잠깐 보관하고 기록 화면으로 (log.js takeShared 가 꺼내 씀)
async function share(req) {
  const f = await req.formData(), c = await caches.open(SHARE);
  for (const k of await c.keys()) await c.delete(k);
  const text = ['title', 'text', 'url'].map(k => f.get(k)).filter(Boolean).join('\n');
  if (text) await c.put('text', new Response(text));
  let i = 0; for (const file of f.getAll('photos')) if (file.size) await c.put('photo-' + i++, new Response(file));
  return Response.redirect(new URL('./?share=1', self.registration.scope), 303);
}

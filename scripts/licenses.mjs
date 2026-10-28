// 오픈소스 라이선스 페이지 만들기: node scripts/licenses.mjs → src/public/licenses.html (라이브러리를 더하거나 바꾸면 다시 실행)
import fs from 'node:fs';
const pkgs = ['@tabler/icons', 'pretendard', 'leaflet', '@capacitor/core', '@capacitor/android', '@capacitor-community/text-to-speech',
  '@supabase/supabase-js', '@supabase/auth-js', '@supabase/functions-js', '@supabase/postgrest-js', '@supabase/realtime-js', '@supabase/storage-js'];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = pkgs.map(n => {
  const d = `node_modules/${n}`, p = JSON.parse(fs.readFileSync(`${d}/package.json`));
  const f = [`${d}/LICENSE`, `${d}/LICENSE.md`, `${d}/dist/LICENSE.txt`].find(fs.existsSync);
  return `<h2>${esc(n)} ${p.version}</h2><p class="meta">${p.license}${p.homepage ? ` · <a href="${p.homepage}" target="_blank" rel="noopener">${esc(p.homepage)}</a>` : ''}</p><pre>${esc(fs.readFileSync(f, 'utf8').trim())}</pre>`;
});
fs.writeFileSync('src/public/licenses.html', `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>오픈소스 라이선스 · 갓생살기</title>
<link rel="stylesheet" href="legal.css">
<style>pre { white-space: pre-wrap; font-size: 12px; background: var(--bg); padding: 12px; border-radius: 8px; }</style>
</head>
<body>
<main>
<p class="back"><a href="./">← 갓생살기로 돌아가기</a></p>
<h1>오픈소스 라이선스</h1>
<p class="meta">갓생살기는 아래 오픈소스 소프트웨어와 자료를 사용합니다. 각 저작권자에게 감사드립니다.</p>
<h2>OpenStreetMap 지도 데이터</h2>
<p class="meta">© OpenStreetMap contributors · Open Database License(ODbL) · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">openstreetmap.org/copyright</a></p>
${rows.join('\n')}
</main>
</body>
</html>
`);
console.log('licenses.html', pkgs.length);

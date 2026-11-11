// 포맷·날짜·알림 등 화면과 무관한 도구
export const DAY = 864e5;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export const fmtNum = (v, d = 0) => Number(v || 0).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtDur = m => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}시간 ${m % 60}분` : `${m}분`; };
// 기록 상세용: 29분 44초 / 1시간 5분 3초
export const fmtDurS = m => {
  const t = Math.round(m * 60), h = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), s = t % 60;
  return [h && `${h}시간`, mm && `${mm}분`, s && `${s}초`].filter(Boolean).join(' ') || '0분';
};
// 입력칸·카드용: 29:44 / 1:05:03
export const fmtClock = m => {
  const t = Math.round(m * 60), h = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${s}` : `${mm}:${s}`;
};
// "29:44"=분:초, "1:05:00"=시:분:초, "45"=45분, "1시간 5분 3초"/"29분 44초"도 허용 → 분(소수)
export function parseDur(s) {
  s = s.trim(); if (!s) return 0;
  const u = s.match(/^(?:(\d+)\s*(?:시간|h))?\s*(?:(\d+)\s*(?:분|m))?\s*(?:(\d+)\s*(?:초|s))?$/i);
  if (u && (u[1] || u[2] || u[3])) return (+u[1] || 0) * 60 + (+u[2] || 0) + (+u[3] || 0) / 60;
  const p = s.split(/[:\s]+/).map(Number);
  if (p.length > 3 || p.some(x => !Number.isFinite(x) || x < 0) || p.slice(1).some(x => x >= 60)) return 0;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] + p[1] / 60 : p[0] * 60 + p[1] + p[2] / 60;
}
export const fmtDist = w => w.type === 'swim' ? fmtNum(w.distance_km * 1000) + ' m' : fmtNum(w.distance_km, 2) + ' km';
export const fmtDate = ts => new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
export const fmtTime = ts => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
export function ago(ts) {
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 7 * 86400) return Math.floor(s / 86400) + '일 전';
  return fmtDate(ts);
}
export function startOf(kind, d = new Date()) {
  d = new Date(d); d.setHours(0, 0, 0, 0);
  if (kind === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  else if (kind === 'month') d.setDate(1);
  else if (kind === 'year') d.setMonth(0, 1);
  return d.getTime();
}
export const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
export const toLocalInput = ts => new Date(new Date(ts) - new Date(ts).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

export const COUNTRIES = [['KR', '대한민국'], ['US', '미국'], ['JP', '일본'], ['CN', '중국'], ['TW', '대만'], ['CA', '캐나다'], ['GB', '영국'], ['AU', '호주'], ['ETC', '기타']];
// 실명 표시 순서(서버 supabase/014 와 같은 규칙): 한국·일본·중국·대만은 성+이름(한글·한자면 붙여서), 그 밖은 이름 성
export const fullName = (family, given, country) => ['KR', 'JP', 'CN', 'TW'].includes(country)
  ? (/[A-Za-z]/.test(family + given) ? `${family} ${given}` : family + given) : `${given} ${family}`;
export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  ([...document.querySelectorAll('dialog[open]')].at(-1) || document.body).append(t); setTimeout(() => t.remove(), 2600);   // 열린 창이 있으면 그 위에
}
// 깐족이 '뿅': 커지며 나타났다 사라짐(누를 수 없음, 1~2초). el 이 화면에 보이면 그 가운데, 아니면 화면 가운데
// src 가 여러 개면 겹쳐서. 열린 창(반응한 사람 목록 등)이 있으면 그 창 위에 보이도록 창 안에 넣음
export function pop(src, el, caption) {
  const box = document.createElement('div'); box.className = 'kk-pop' + (caption ? ' long' : '');
  const pics = document.createElement('span'); pics.className = 'kk-pics'; box.append(pics);
  for (const s of [src].flat()) { const img = document.createElement('img'); img.src = s; img.alt = ''; pics.append(img); }
  if (caption) { const p = document.createElement('p'); p.textContent = caption; box.append(p); }
  const r = el?.getBoundingClientRect();
  if (r && r.bottom > 120 && r.top < innerHeight - 120) {
    const top = Math.max(r.top, 60), bottom = Math.min(r.bottom, innerHeight - 60);
    box.style.left = `${r.left + r.width / 2}px`; box.style.top = `${(top + bottom) / 2}px`;
  }
  document.querySelectorAll('.kk-pop').forEach(b => b.remove());   // 한 번에 하나만(창 안에 남은 지난 깐족이도 치움)
  ([...document.querySelectorAll('dialog[open]')].at(-1) || document.body).append(box);
  box.addEventListener('animationend', () => box.remove());
  setTimeout(() => box.remove(), 3000);   // 창이 닫혀 움직임이 멈춰도 반드시 사라지게
}
export function fail(err, fallback = '실패했어요. 잠시 후 다시 시도해 주세요.') {
  console.error(err);
  const m = err?.message || '';
  // 서버 SQL 이 한국어로 낸 오류(약올리기 끔, 도배 방지 등)는 그대로 보여 줌
  toast(/[가-힣]/.test(m) ? m
    : /Invalid login/.test(m) ? '이메일 또는 비밀번호가 맞지 않아요.'
    : /rate limit|security purposes/i.test(m) ? '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.'
    : /Database error saving new user/.test(m) ? '가입하지 못했어요. 만 14세 이상인지 생년월일을 확인해 주세요.'
    : /should be different/.test(m) ? '예전과 다른 비밀번호를 입력해 주세요.'
    : /already registered/.test(m) ? '이미 가입된 이메일이에요. 로그인해 주세요.'
    : /Email not confirmed/.test(m) ? '메일함에서 가입 확인 링크를 먼저 눌러 주세요.'
    : fallback);
}

// 사진 줄이기(JPEG). 다시 그려 저장하므로 사진 속 촬영 위치(EXIF GPS)도 함께 지워짐
// square: 가운데를 정사각형으로 잘라 max×max (프로필 사진)
export async function compress(file, max = 1600, square = false) {
  const img = await createImageBitmap(file), c = document.createElement('canvas');
  const side = Math.min(img.width, img.height);
  const [sx, sy, sw, sh] = square ? [(img.width - side) / 2, (img.height - side) / 2, side, side] : [0, 0, img.width, img.height];
  const s = Math.min(1, max / Math.max(sw, sh));
  c.width = Math.round(sw * s); c.height = Math.round(sh * s);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .8));
}

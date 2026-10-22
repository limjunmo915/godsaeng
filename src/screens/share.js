// 인스타 4:5 공유 카드 (울트라마린 바탕 + 약올림 옐로)
import { S } from '../state.js';
import { fmtNum, fmtDur, fmtClock, fmtDist, fmtDate, startOf, toast } from '../lib/util.js';
import { typeOf } from '../lib/types.js';
import { sum, pace } from '../lib/calc.js';
import { signPhotos } from '../lib/data.js';

const F = '"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif';
const BRAND = '#3D2EFF', TAUNT = '#FFE14D', TAUNT_INK = '#3A3000';

async function makeCard({ kicker, title, stats, brag, photo }) {
  await document.fonts.load(`800 64px "Pretendard Variable"`).catch(() => {});
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = BRAND; g.fillRect(0, 0, W, H);
  if (photo) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = photo;
    try {
      await img.decode();
      const s = Math.max(W / img.width, H / img.height);
      g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      const grd = g.createLinearGradient(0, H * 0.3, 0, H); grd.addColorStop(0, 'rgba(13,15,26,0)'); grd.addColorStop(1, 'rgba(13,15,26,.9)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    } catch {}
  }
  // 상단 워드마크
  g.fillStyle = '#fff'; g.font = `800 40px ${F}`; g.fillText('갓생살기', 72, 120);
  g.fillStyle = TAUNT; g.beginPath(); g.arc(72 + g.measureText('갓생살기').width + 16, 108, 8, 0, Math.PI * 2); g.fill();
  // 하단: 수치 3칸 → 제목 → 종목·날짜 → 약올리기 한마디
  let y = H - 88;
  const cw = (W - 144) / 3;
  stats.slice(0, 3).forEach(([k, val], i) => {
    g.fillStyle = 'rgba(255,255,255,.72)'; g.font = `600 28px ${F}`; g.fillText(k, 72 + i * cw, y - 72);
    g.fillStyle = '#fff'; g.font = `800 56px ${F}`; g.fillText(val, 72 + i * cw, y, cw - 16);
  });
  y -= 160;
  g.fillStyle = '#fff'; g.font = `800 88px ${F}`;
  for (const l of wrap(g, title, W - 144).slice(0, 2).reverse()) { g.fillText(l, 72, y); y -= 104; }
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 32px ${F}`; g.fillText(kicker, 72, y + 24);
  if (brag) {
    g.font = `700 38px ${F}`; const bw = Math.min(W - 144, g.measureText(brag).width + 56);
    g.fillStyle = TAUNT; roundRect(g, 72, y - 104, bw, 72, 36); g.fill();
    g.fillStyle = TAUNT_INK; g.fillText(brag, 100, y - 54, bw - 56);
  }
  try { return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(), 'image/jpeg', .9)); }
  catch { return photo ? makeCard({ kicker, title, stats, brag }) : null; } // 사진 CORS 실패 시 사진 없이
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function wrap(g, text, max) {
  const out = []; let line = '';
  for (const ch of String(text)) { if (g.measureText(line + ch).width > max) { out.push(line); line = ch; } else line += ch; }
  return [...out, line];
}
async function shareBlob(blob) {
  if (!blob) return toast('카드를 만들지 못했어요.');
  const file = new File([blob], 'godsaeng.jpg', { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: '질 수 없다! #갓생살기' }); } catch {} return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'godsaeng.jpg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('카드 이미지를 저장했어요');
}
export async function shareWorkout(w) {
  toast('카드 만드는 중…');
  const t = typeOf(w.type), pc = pace(w);
  const stats = [+w.distance_km ? ['거리', fmtDist(w)] : null, ['시간', fmtClock(w.duration_min)], pc || ['칼로리', fmtNum(w.kcal) + ' kcal']].filter(Boolean);
  shareBlob(await makeCard({ kicker: `${t.label} · ${fmtDate(w.started_at)}`, title: w.title || `${t.label} 완료`, stats, brag: w.brag, photo: S.urls[w.photos[0]] }));
}
export async function shareRecap() {
  toast('카드 만드는 중…');
  const tm = sum(S.mine.filter(w => new Date(w.started_at) >= startOf('month')));
  const withPhoto = S.mine.find(w => new Date(w.started_at) >= startOf('month') && w.photos?.length);
  if (withPhoto) await signPhotos([withPhoto.photos[0]]);
  shareBlob(await makeCard({
    kicker: `${S.me.nickname}의 ${new Date().getMonth() + 1}월 결산`, title: `${tm.count}번 운동 완료`,
    stats: [['시간', fmtDur(tm.minutes)], ['칼로리', fmtNum(tm.kcal)], ['포인트', fmtNum(tm.points) + 'P']],
    brag: '이번 달도 내가 이김 😝', photo: withPhoto && S.urls[withPhoto.photos[0]],
  }));
}

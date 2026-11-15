// 사진 크게 보기: 피드·프로필·검색의 운동 사진을 누르면 전체 화면. 이 안에서만 두 손가락 확대(1~5배)·한 손가락 이동, 두 번 톡 = 2배/원래대로
// 앱 화면 자체는 확대 안 됨(index.html viewport + styles.css touch-action)
import { $ } from '../state.js';

const dlg = $('#img-view'), img = dlg.querySelector('img');
let s = 1, x = 0, y = 0, lastTap = 0;
const pts = new Map(); let start = null;
const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
const reset = () => { s = 1; x = 0; y = 0; apply(); };
// 사진 밖으로 너무 빠지지 않게
function clamp() {
  if (s <= 1) { reset(); return; }
  const w = dlg.clientWidth, h = dlg.clientHeight;
  x = Math.min(0, Math.max(w - w * s, x)); y = Math.min(0, Math.max(h - h * s, y)); apply();
}
// (cx, cy) 를 중심으로 배율 바꾸기
function zoomAt(ns, cx, cy) { ns = Math.min(5, Math.max(1, ns)); x = cx - (cx - x) * ns / s; y = cy - (cy - y) * ns / s; s = ns; apply(); }

document.addEventListener('click', e => {
  const p = e.target.closest('.photos img'); if (!p || p.dataset.act) return;
  img.src = p.src; reset(); dlg.showModal();
});
dlg.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  dlg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const [a, b] = [...pts.values()];
  start = b ? { d: Math.hypot(a.x - b.x, a.y - b.y), s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x, y } : { px: a.x, py: a.y, x, y };
  if (pts.size === 1) {   // 두 번 톡
    if (Date.now() - lastTap < 300) { s > 1 ? reset() : zoomAt(2, e.clientX, e.clientY); clamp(); lastTap = 0; } else lastTap = Date.now();
  }
});
dlg.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId) || !start) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const [a, b] = [...pts.values()];
  if (b && start.d) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    s = start.s; x = start.x + (mx - start.mx); y = start.y + (my - start.my);
    zoomAt(start.s * Math.hypot(a.x - b.x, a.y - b.y) / start.d, mx, my);
  } else if (!b && s > 1) { x = start.x + a.x - start.px; y = start.y + a.y - start.py; apply(); }
});
const up = e => { pts.delete(e.pointerId); start = null; if (!pts.size) clamp(); else { const [a] = pts.values(); start = { px: a.x, py: a.y, x, y }; } };
dlg.addEventListener('pointerup', up); dlg.addEventListener('pointercancel', up);
dlg.addEventListener('close', () => { pts.clear(); img.removeAttribute('src'); });

export const actions = { 'img-close': () => dlg.close() };

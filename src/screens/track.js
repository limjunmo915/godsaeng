// GPS 기록 화면 — 시험 중(위치기반서비스 신고 전): 주소에 ?gps=1(실제 GPS) 또는 ?gps=sim(가짜 5km)을 붙여 켠 폰에서만 보임, ?gps=off 로 끔
// 경로(위치)는 서버에 저장하지 않음. 끝나면 거리·시간·상승고도만 기록 화면에 채우고, 경로 그림은 이 폰 화면에만
import { $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { fmtClock, toast, lsGet } from '../lib/util.js';
import { TYPES } from '../lib/types.js';
import { accept, summarize, trim, routeSvg, fakeTrack } from '../lib/gps.js';
import { fillAuto } from './log.js';

const KINDS = ['run', 'walk', 'hike', 'ride'];
let R = null;   // 기록 중 상태 { type, segs, state: ready | rec | pause, stop, wake }

// 위치 입구: 지금은 브라우저 GPS(화면이 켜져 있을 때만 됨). 안드로이드 앱에선 이 함수만 백그라운드 위치 플러그인으로 바꿈
function source(onPoint) {
  if (lsGet('gps') === 'sim') {
    const pts = fakeTrack(5, 330); let i = 0;
    const h = setInterval(() => i < pts.length ? onPoint(pts[i++]) : clearInterval(h), 40);
    return () => clearInterval(h);
  }
  const id = navigator.geolocation.watchPosition(
    p => onPoint({ t: p.timestamp, lat: p.coords.latitude, lng: p.coords.longitude, alt: p.coords.altitude, acc: p.coords.accuracy }),
    e => toast(e.code === 1 ? '위치 권한을 허용해 주세요' : '위치를 아직 못 잡았어요'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(id);
}
// 화면 꺼짐 방지(웹앱은 화면이 꺼지면 GPS 가 멈춤)
const lock = async () => { try { R.wake = await navigator.wakeLock?.request('screen'); } catch { /* 지원 안 함 */ } };
document.addEventListener('visibilitychange', () => { if (!document.hidden && R?.state === 'rec') lock(); });

const pace = s => s.paceSec ? `${Math.floor(s.paceSec / 60)}:${String(Math.round(s.paceSec % 60)).padStart(2, '0')}` : '-:--';
function render() {
  const s = summarize(R.segs), ride = TYPES[R.type].pace === 'kmh', got = R.segs.some(g => g.length);
  $('#trk-body').innerHTML = `<header class="pp-top"><button class="icbtn" data-act="trk-close" aria-label="닫기">${ic('x')}</button><h2>GPS 기록 <small class="tag">시험 중</small></h2><div></div></header>
    ${R.state === 'ready' ? `<div class="chips">${KINDS.map(k => `<button type="button" class="chip" data-act="trk-type" data-v="${k}" aria-pressed="${k === R.type}">${ic(TYPES[k].icon)}${TYPES[k].label}</button>`).join('')}</div>` : ''}
    <div class="trk-nums">
      <div class="big"><small>시간</small><b class="num">${fmtClock(s.minutes)}</b></div>
      <div><small>거리</small><b class="num">${s.km.toFixed(2)}<small> km</small></b></div>
      <div><small>${ride ? '평균 속도' : '평균 페이스'}</small><b class="num">${ride ? (s.minutes ? (s.km / (s.minutes / 60)).toFixed(1) : '0.0') + '<small> km/h</small>' : pace(s) + '<small> /km</small>'}</b></div>
      <div><small>상승고도</small><b class="num">${Math.round(s.elev)}<small> m</small></b></div>
    </div>
    <p class="hint trk-state">${R.state === 'ready' ? '화면을 켜 둔 채로 기록해요. 화면이 꺼지면 기록이 멈춰요(안드로이드 앱에선 꺼져도 기록).'
      : R.state === 'pause' ? '일시정지' : got ? 'GPS 기록 중 · 화면을 끄지 마세요' : 'GPS 신호 잡는 중…'}</p>
    ${s.splits.length ? `<ol class="splits">${s.splits.map((sec, i) => `<li><span>${i + 1} km</span><b class="num">${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}</b></li>`).join('')}</ol>` : ''}
    <div class="trk-btns">${R.state === 'ready' ? `<button class="btn primary wide" data-act="trk-start">시작</button>`
      : R.state === 'rec' ? `<button class="btn wide" data-act="trk-pause">일시정지</button>`
      : `<button class="btn primary" data-act="trk-start">계속</button><button class="btn" data-act="trk-end">종료하고 기록하기</button>`}</div>`;
}

export const actions = {
  'trk-open': () => {
    R = { type: 'run', segs: [], state: 'ready' };
    $('#trk').hidden = false; document.body.classList.add('pp-open'); render();
  },
  'trk-type': b => { R.type = b.dataset.v; render(); },
  'trk-start': () => {
    const seg = []; R.segs.push(seg); R.state = 'rec'; lock();
    R.stop = source(p => { if (accept(seg.at(-1), p, TYPES[R.type].vmax)) { seg.push(p); render(); } });
    render();
  },
  'trk-pause': () => { R.stop(); R.state = 'pause'; render(); },
  'trk-end': async () => {
    const s = summarize(R.segs), pts = R.segs.flat();
    if (s.km < 0.05) return toast('기록할 거리가 너무 짧아요(50m 미만).');
    actions['trk-close'](true);
    await fillAuto({ type: R.type, start: pts[0].t, minutes: s.minutes, km: s.km, elev: s.elev });
    $('#route-prev').innerHTML = `${routeSvg(trim(pts))}<p class="hint">경로 그림은 이 폰에서만 보여요(출발·도착 200m는 가림). 저장되는 건 거리·시간·상승고도예요.</p>`;
  },
  'trk-close': force => {
    if (force !== true && R?.state !== 'ready' && !confirm('기록을 그만두고 닫을까요? 지금까지 기록은 사라져요.')) return;
    R?.stop?.(); R?.wake?.release?.().catch(() => {});
    $('#trk').hidden = true;
    if (!document.querySelector('.pp:not([hidden])')) document.body.classList.remove('pp-open');
  },
};

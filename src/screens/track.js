// GPS 기록 화면 — 시험 중(웹·앱 모두 보임). 주소에 ?gps=sim 을 붙이면 가짜 5km, ?gps=off 로 실제 GPS 로 되돌림
// 경로(위치)는 서버에 저장하지 않음. 끝나면 거리·시간·상승고도만 기록 화면에 채우고, 지도·경로 그림은 이 폰 화면에만
import { $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { fmtClock, toast, lsGet } from '../lib/util.js';
import { TYPES } from '../lib/types.js';
import { accept, summarize, trim, routeSvg, fakeTrack } from '../lib/gps.js';
import { fillAuto } from './log.js';

const KINDS = ['run', 'walk', 'hike', 'ride'];
let R = null;   // 기록 상태 { type, segs, state: ready | rec | pause, last(마지막 위치), follow, stop, wake, 지도 }

// 위치 입구: 화면을 열면 바로 켜서 지도에 내 위치를 보여 주고, '시작' 뒤의 점만 기록에 씀
// 지금은 브라우저 GPS(화면이 켜져 있을 때만 됨). 안드로이드 앱 백그라운드 기록은 이 함수만 위치 플러그인으로 바꿈
function source(onPoint) {
  if (lsGet('gps') === 'sim') {   // 가짜: 첫 점은 바로, 나머지는 기록 중일 때만 흘림
    const pts = fakeTrack(5, 330); let i = 0;
    onPoint(pts[i++]);
    const h = setInterval(() => R?.state === 'rec' && i < pts.length && onPoint(pts[i++]), 40);
    return () => clearInterval(h);
  }
  const id = navigator.geolocation.watchPosition(
    p => onPoint({ t: p.timestamp, lat: p.coords.latitude, lng: p.coords.longitude, alt: p.coords.altitude, acc: p.coords.accuracy }),
    e => { if (!R) return; R.err = e.code === 1 ? '위치 권한이 꺼져 있어요. 휴대폰 설정에서 위치를 허용해 주세요.' : '위치를 아직 못 잡았어요. 하늘이 보이는 곳으로 가 보세요.'; info(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(id);
}
// 화면 꺼짐 방지(웹앱은 화면이 꺼지면 GPS 가 멈춤)
const lock = async () => { try { R.wake = await navigator.wakeLock?.request('screen'); } catch { /* 지원 안 함 */ } };
document.addEventListener('visibilitychange', () => { if (!document.hidden && R?.state === 'rec') lock(); });

// 지도: Leaflet + OpenStreetMap 지도(키·가입 없음). 처음 열 때만 불러와서 첫 화면은 가볍게
// ponytail: OSM 무료 지도는 많이 쓰면 막힘(이용 정책) — 사용자 늘면·출시 땐 카카오/네이버 지도로 바꾸기
const LINE = { color: '#2A1FC2', weight: 5, opacity: 0.9 };
async function makeMap() {
  const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
  if (!R) return;
  const map = L.map('trk-map', { zoomControl: false }).setView([37.5665, 126.978], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  map.on('dragstart', () => { R.follow = false; });
  R.L = L; R.map = map;
  R.acc = L.circle([0, 0], { radius: 0, weight: 0, fillColor: '#3B82F6', fillOpacity: 0.15, interactive: false });
  R.dot = L.circleMarker([0, 0], { radius: 7, weight: 3, color: '#fff', fillColor: '#3B82F6', fillOpacity: 1, interactive: false });
  R.lines = R.segs.map(seg => L.polyline(seg.map(p => [p.lat, p.lng]), LINE).addTo(map));
  if (R.last) move(R.last);
}

// 내 위치 점(+ 오차 범위 원) 옮기기, 따라가기 켜져 있으면 지도도 이동
function move(p) {
  if (!R.map) return;
  const ll = [p.lat, p.lng];
  R.dot.setLatLng(ll).addTo(R.map); R.acc.setLatLng(ll).setRadius(p.acc || 0).addTo(R.map);
  if (R.follow) R.map.setView(ll, Math.max(R.map.getZoom(), 16), { animate: false });
}

function onPoint(p) {
  if (!R) return;
  R.last = p; R.err = null; move(p);
  const seg = R.segs.at(-1);
  if (R.state === 'rec' && accept(seg.at(-1), p, TYPES[R.type].vmax)) { seg.push(p); R.lines?.at(-1)?.addLatLng([p.lat, p.lng]); }
  info();
}

const pace = s => s.paceSec ? `${Math.floor(s.paceSec / 60)}:${String(Math.round(s.paceSec % 60)).padStart(2, '0')}` : '-:--';
// GPS 신호 상태: 오차 30m 넘는 점은 기록에 안 씀(gps.js accept)
const signal = () => R.err ? `<b class="bad">${R.err}</b>`
  : !R.last ? '내 위치 찾는 중…'
  : R.last.acc > 30 ? `<b class="bad">GPS 신호 약함 (오차 ±${Math.round(R.last.acc)}m) · 이대로는 기록에 안 써요</b>`
  : `GPS 신호 좋음 (오차 ±${Math.round(R.last.acc)}m)`;

// 지도 아래 부분만 다시 그림(지도는 그대로 둠)
function info() {
  if (!R) return;
  const s = summarize(R.segs), ride = TYPES[R.type].pace === 'kmh', got = R.segs.some(g => g.length);
  $('#trk-info').innerHTML = `<p class="hint trk-sig">${signal()}</p>
    ${R.state === 'ready' ? `<div class="chips">${KINDS.map(k => `<button type="button" class="chip" data-act="trk-type" data-v="${k}" aria-pressed="${k === R.type}">${ic(TYPES[k].icon)}${TYPES[k].label}</button>`).join('')}</div>
      <p class="hint">GPS 위치와 거리는 실제와 몇 m~수십 m 다를 수 있어요. 건물 사이·실내·터널·숲속에선 더 크게 틀려요. 화면을 켜 둔 채로 기록해요(화면이 꺼지면 기록이 멈춰요).</p>` : ''}
    <div class="trk-nums">
      <div class="big"><small>시간</small><b class="num">${fmtClock(s.minutes)}</b></div>
      <div><small>거리</small><b class="num">${s.km.toFixed(2)}<small> km</small></b></div>
      <div><small>${ride ? '평균 속도' : '평균 페이스'}</small><b class="num">${ride ? (s.minutes ? (s.km / (s.minutes / 60)).toFixed(1) : '0.0') + '<small> km/h</small>' : pace(s) + '<small> /km</small>'}</b></div>
      <div><small>상승고도</small><b class="num">${Math.round(s.elev)}<small> m</small></b></div>
    </div>
    ${R.state !== 'ready' ? `<p class="hint trk-state">${R.state === 'pause' ? '일시정지' : got ? '기록 중 · 화면을 끄지 마세요' : '기록 시작 · 첫 위치 기다리는 중…'}</p>` : ''}
    <div class="trk-btns">${R.state === 'ready' ? `<button class="btn primary wide" data-act="trk-start">시작</button>`
      : R.state === 'rec' ? `<button class="btn wide" data-act="trk-pause">일시정지</button>`
      : `<button class="btn primary" data-act="trk-start">계속</button><button class="btn" data-act="trk-end">종료하고 기록하기</button>`}</div>
    ${s.splits.length ? `<ol class="splits">${s.splits.map((sec, i) => `<li><span>${i + 1} km</span><b class="num">${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}</b></li>`).join('')}</ol>` : ''}`;
}

export const actions = {
  'trk-open': () => {
    R = { type: 'run', segs: [], state: 'ready', follow: true };
    $('#trk-body').innerHTML = `<header class="pp-top"><button class="icbtn" data-act="trk-close" aria-label="닫기">${ic('x')}</button><h2>GPS 기록 <small class="tag">시험 중</small></h2><div></div></header>
      <div class="trk-mapbox"><div id="trk-map"></div><button type="button" class="icbtn trk-me" data-act="trk-me" aria-label="내 위치로">${ic('current-location')}</button></div>
      <div id="trk-info"></div>`;
    $('#trk').hidden = false; document.body.classList.add('pp-open');
    info();
    makeMap().catch(e => { console.error(e); toast('지도를 못 불러왔어요. 기록은 그대로 돼요.'); });
    R.stop = source(onPoint);
  },
  'trk-type': b => { R.type = b.dataset.v; info(); },
  'trk-me': () => { R.follow = true; if (R.last) move(R.last); else toast('아직 내 위치를 못 찾았어요'); },
  'trk-start': () => {
    R.segs.push([]); R.state = 'rec'; R.follow = true; lock();
    if (R.L) R.lines.push(R.L.polyline([], LINE).addTo(R.map));
    info();
  },
  'trk-pause': () => { R.state = 'pause'; info(); },
  'trk-end': async () => {
    const s = summarize(R.segs), pts = R.segs.flat(), type = R.type;
    if (s.km < 0.05) return toast('기록할 거리가 너무 짧아요(50m 미만).');
    actions['trk-close'](true);
    await fillAuto({ type, start: pts[0].t, minutes: s.minutes, km: s.km, elev: s.elev });
    $('#route-prev').innerHTML = `${routeSvg(trim(pts))}<p class="hint">경로 그림은 이 폰에서만 보여요(출발·도착 200m는 가림). 저장되는 건 거리·시간·상승고도예요.</p>`;
  },
  'trk-close': force => {
    if (force !== true && R?.state !== 'ready' && !confirm('기록을 그만두고 닫을까요? 지금까지 기록은 사라져요.')) return;
    R?.stop?.(); R?.wake?.release?.().catch(() => {}); R?.map?.remove(); R = null;
    $('#trk').hidden = true;
    if (!document.querySelector('.pp:not([hidden])')) document.body.classList.remove('pp-open');
  },
};

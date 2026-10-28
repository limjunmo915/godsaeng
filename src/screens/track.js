// GPS 기록 화면 — 시험 중(웹·앱 모두 보임). 주소에 ?gps=sim 을 붙이면 가짜 5km, ?gps=off 로 실제 GPS 로 되돌림
// 경로(위치)는 서버에 저장하지 않음. 끝나면 거리·시간·상승고도만 기록 화면에 채우고, 지도·경로 그림은 이 폰 화면에만
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { fmtClock, toast, lsGet, lsSet } from '../lib/util.js';
import { TYPES } from '../lib/types.js';
import { dist, accept, summarize, recentPace, trim, routeSvg, fakeTrack } from '../lib/gps.js';
import { fillAuto } from './log.js';

const KINDS = ['run', 'walk', 'hike', 'ride'];
// 목표(NRC 식): 거리 또는 시간(움직인 시간)
const GOALS = [null, { k: 'km', v: 3 }, { k: 'km', v: 5 }, { k: 'km', v: 10 }, { k: 'min', v: 20 }, { k: 'min', v: 30 }, { k: 'min', v: 60 }];
const goalTxt = g => g ? g.k === 'km' ? `${g.v}km` : `${g.v}분` : '없음';
let R = null;   // 기록 상태 { type, goal, segs, laps, state: ready | count | rec | pause, last(마지막 위치), moveAt, auto(자동 일시정지), said(안내한 km), done(목표 달성), follow, stop, wake, 지도 }

// 음성 안내: 앱에선 안드로이드 음성, 웹에선 브라우저 음성(플러그인이 알아서 고름). 끄면 이 폰에 기억
let voice = lsGet('voice') !== 'off';
const say = t => { if (voice) TextToSpeech.speak({ text: t, lang: 'ko-KR', rate: 1.05, category: 'playback' }).catch(() => {}); };
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const saySec = sec => `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`;
const isRide = () => TYPES[R.type].pace === 'kmh';
const speed = paceSec => paceSec ? (3600 / paceSec).toFixed(1) : '0.0';

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

// 목표까지 남은 양(안내 문구용)
const left = s => !R.goal ? '' : R.goal.k === 'km' ? `${Math.max(0, R.goal.v - s.km).toFixed(1)}km` : `${Math.max(0, Math.ceil(R.goal.v - s.minutes))}분`;

function onPoint(p) {
  if (!R) return;
  R.last = p; R.err = null; move(p);
  if (R.state === 'rec') {
    const seg = R.segs.at(-1), prev = seg.at(-1);
    if (accept(prev, p, TYPES[R.type].vmax)) {
      seg.push(p); R.lines?.at(-1)?.addLatLng([p.lat, p.lng]);
      if (!prev || dist(prev, p) / ((p.t - prev.t) / 1000) >= 0.5) R.moveAt = p.t;   // 초속 0.5m 이상 = 움직이는 중
    }
    // 자동 일시정지(스트라바 식): 10초 넘게 안 움직이면. 멈춘 시간은 원래 기록에서 빠짐(gps.js summarize)
    const auto = R.moveAt != null && p.t - R.moveAt > 10000;
    if (auto !== R.auto) { R.auto = auto; say(auto ? '자동 일시정지' : '다시 출발'); }
    announce();
  }
  info();
}

// 1km마다 음성 안내 + 목표 달성
function announce() {
  const s = summarize(R.segs);
  const reached = R.goal && !R.done && (R.goal.k === 'km' ? s.km >= R.goal.v : s.minutes >= R.goal.v);
  if (s.splits.length > R.said) {
    R.said = s.splits.length;
    const sec = s.splits.at(-1);
    say(`${R.said}킬로미터. ${isRide() ? `구간 시속 ${speed(sec)}킬로미터` : `구간 페이스 ${saySec(sec)}`}. 시간 ${saySec(s.minutes * 60)}${R.goal && !R.done && !reached ? `. 목표까지 ${left(s).replace('km', '킬로미터')}` : ''}`);
  }
  if (reached) { R.done = true; say(`목표 ${goalTxt(R.goal).replace('km', '킬로미터')} 달성! 잘했어요`); toast(`🎉 목표 ${goalTxt(R.goal)} 달성!`); }
}

// GPS 신호 상태: 오차 30m 넘는 점은 기록에 안 씀(gps.js accept)
const signal = () => R.err ? `<b class="bad">${R.err}</b>`
  : !R.last ? '내 위치 찾는 중…'
  : R.last.acc > 30 ? `<b class="bad">GPS 신호 약함 (오차 ±${Math.round(R.last.acc)}m) · 이대로는 기록에 안 써요</b>`
  : `GPS 신호 좋음 (오차 ±${Math.round(R.last.acc)}m)`;
const paceOrSpeed = sec => isRide() ? `${speed(sec)}<small> km/h</small>` : `${sec ? mmss(sec) : '-:--'}<small> /km</small>`;

// 지도 아래 부분만 다시 그림(지도는 그대로 둠)
function info() {
  if (!R) return;
  const s = summarize(R.segs), got = R.segs.some(g => g.length), now = R.auto ? 0 : recentPace(R.segs.at(-1) || []);
  const pct = R.goal ? Math.min(100, (R.goal.k === 'km' ? s.km : s.minutes) / R.goal.v * 100) : 0;
  const laps = R.laps.map((l, i) => { const p = R.laps[i - 1] || { km: 0, minutes: 0 }; return { km: l.km - p.km, sec: (l.minutes - p.minutes) * 60 }; });
  $('#trk-info').innerHTML = `<p class="hint trk-sig">${signal()}</p>
    ${R.state === 'ready' ? `<div class="chips">${KINDS.map(k => `<button type="button" class="chip" data-act="trk-type" data-v="${k}" aria-pressed="${k === R.type}">${ic(TYPES[k].icon)}${TYPES[k].label}</button>`).join('')}</div>
      <p class="trk-lbl">목표</p><div class="chips">${GOALS.map((g, i) => `<button type="button" class="chip" data-act="trk-goal" data-i="${i}" aria-pressed="${goalTxt(g) === goalTxt(R.goal)}">${goalTxt(g)}</button>`).join('')}</div>
      <p class="hint">GPS 위치와 거리는 실제와 몇 m~수십 m 다를 수 있어요. 건물 사이·실내·터널·숲속에선 더 크게 틀려요. 화면을 켜 둔 채로 기록해요(화면이 꺼지면 기록이 멈춰요).</p>` : ''}
    ${R.state === 'count' ? `<div class="trk-count num">${R.n}</div>` : `<div class="trk-nums">
      <div class="big"><small>시간</small><b class="num">${fmtClock(s.minutes)}</b></div>
      <div><small>거리</small><b class="num">${s.km.toFixed(2)}<small> km</small></b></div>
      <div><small>${isRide() ? '지금 속도' : '지금 페이스'}</small><b class="num">${paceOrSpeed(now)}</b></div>
      <div><small>${isRide() ? '평균 속도' : '평균 페이스'}</small><b class="num">${paceOrSpeed(s.paceSec)}</b></div>
      <div><small>상승고도</small><b class="num">${Math.round(s.elev)}<small> m</small></b></div>
    </div>`}
    ${R.goal && R.state !== 'ready' ? `<div class="trk-goal"><span style="width:${pct}%"></span></div><p class="hint trk-state">${R.done ? `🎉 목표 ${goalTxt(R.goal)} 달성!` : `목표 ${goalTxt(R.goal)}까지 ${left(s)} 남음`}</p>` : ''}
    ${R.state === 'rec' || R.state === 'pause' ? `<p class="hint trk-state">${R.state === 'pause' ? '일시정지' : R.auto ? '<b>자동 일시정지</b> · 움직이면 다시 기록해요' : got ? '기록 중 · 화면을 끄지 마세요' : '기록 시작 · 첫 위치 기다리는 중…'}</p>` : ''}
    <div class="trk-btns">${R.state === 'ready' ? `<button class="btn primary wide" data-act="trk-start">시작</button>`
      : R.state === 'count' ? '' : R.state === 'rec' ? `<button class="btn" data-act="trk-lap">랩</button><button class="btn" data-act="trk-pause">일시정지</button>`
      : `<button class="btn primary" data-act="trk-start">계속</button><button class="btn" data-act="trk-end">종료하고 기록하기</button>`}</div>
    ${laps.length ? `<p class="trk-lbl">랩</p><ol class="splits">${laps.map((l, i) => `<li><span>랩 ${i + 1} · ${l.km.toFixed(2)} km</span><b class="num">${mmss(l.sec)}</b></li>`).join('')}</ol>` : ''}
    ${s.splits.length ? `<p class="trk-lbl">1km 구간</p><ol class="splits">${s.splits.map((sec, i) => `<li><span>${i + 1} km</span><b class="num">${mmss(sec)}</b></li>`).join('')}</ol>` : ''}`;
}

// 기록 시작(처음·일시정지 뒤 계속): 새 구간을 열고 지도에 새 선
function begin() {
  R.segs.push([]); R.state = 'rec'; R.follow = true; R.moveAt = null; R.auto = false; lock();
  if (R.L) R.lines.push(R.L.polyline([], LINE).addTo(R.map));
  info();
}
const voiceBtn = () => `<button class="icbtn" data-act="trk-voice" aria-label="음성 안내 ${voice ? '끄기' : '켜기'}">${ic(voice ? 'volume' : 'volume-off')}</button>`;

export const actions = {
  'trk-open': () => {
    R = { type: 'run', goal: null, segs: [], laps: [], said: 0, state: 'ready', follow: true };
    $('#trk-body').innerHTML = `<header class="pp-top"><button class="icbtn" data-act="trk-close" aria-label="닫기">${ic('x')}</button><h2>GPS 기록 <small class="tag">시험 중</small></h2><div id="trk-vbtn">${voiceBtn()}</div></header>
      <div class="trk-mapbox"><div id="trk-map"></div><button type="button" class="icbtn trk-me" data-act="trk-me" aria-label="내 위치로">${ic('current-location')}</button></div>
      <div id="trk-info"></div>`;
    $('#trk').hidden = false; document.body.classList.add('pp-open');
    info();
    makeMap().catch(e => { console.error(e); toast('지도를 못 불러왔어요. 기록은 그대로 돼요.'); });
    R.stop = source(onPoint);
  },
  'trk-type': b => { R.type = b.dataset.v; info(); },
  'trk-goal': b => { R.goal = GOALS[b.dataset.i]; info(); },
  'trk-me': () => { R.follow = true; if (R.last) move(R.last); else toast('아직 내 위치를 못 찾았어요'); },
  'trk-voice': () => { voice = !voice; lsSet('voice', voice ? 'on' : 'off'); $('#trk-vbtn').innerHTML = voiceBtn(); say('음성 안내를 켰어요'); },
  // 처음 시작은 3-2-1 카운트다운(NRC 식), 일시정지 뒤 '계속'은 바로
  'trk-start': () => {
    if (R.state === 'pause') { say('다시 시작'); return begin(); }
    R.state = 'count'; R.n = 3; say('3'); info();
    const h = setInterval(() => {
      if (!R || R.state !== 'count') return clearInterval(h);
      if (--R.n) { say(String(R.n)); info(); } else { clearInterval(h); say(`시작! ${R.goal ? `목표 ${goalTxt(R.goal).replace('km', '킬로미터')}` : ''}`); begin(); }
    }, 1000);
  },
  'trk-lap': () => {
    const s = summarize(R.segs), p = R.laps.at(-1) || { km: 0, minutes: 0 };
    R.laps.push({ km: s.km, minutes: s.minutes });
    say(`랩 ${R.laps.length}. ${saySec((s.minutes - p.minutes) * 60)}`); info();
  },
  'trk-pause': () => { R.state = 'pause'; R.auto = false; say('일시정지'); info(); },
  'trk-end': async () => {
    const s = summarize(R.segs), pts = R.segs.flat(), type = R.type;
    if (s.km < 0.05) return toast('기록할 거리가 너무 짧아요(50m 미만).');
    actions['trk-close'](true);
    say(`수고했어요. ${s.km.toFixed(2)}킬로미터, ${saySec(s.minutes * 60)}`);
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

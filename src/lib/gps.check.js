// GPS 계산 확인: node src/lib/gps.check.js  (아무것도 안 나오고 'ok' 면 통과)
import assert from 'node:assert';
import { dist, accept, summarize, trim, fakeTrack, recentPace } from './gps.js';

// 위도 0.01도 ≈ 1.11km
assert(Math.abs(dist({ lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127 }) - 1112) < 5);

// 가짜 5km(튀는 점 포함) → 걸러낸 뒤 5km ± 2%, 페이스 5:30 ± 5초, 구간 4~5개
const raw = fakeTrack(5, 330), pts = [];
for (const p of raw) if (accept(pts.at(-1), p)) pts.push(p);
assert(pts.length < raw.length, '튀는 점을 걸러야 함');
const s = summarize([pts]);
assert(Math.abs(s.km - 5) < 0.1, `거리 ${s.km}`);
assert(Math.abs(s.paceSec - 330) < 5, `페이스 ${s.paceSec}`);
assert(s.splits.length >= 4 && s.splits.length <= 5, `구간 ${s.splits.length}`);
assert(s.elev > 0 && s.elev < 200, `상승 ${s.elev}`);

// 일시정지 사이(구간 사이) 시간·거리는 안 셈
const half = Math.floor(pts.length / 2), paused = pts.slice(half).map(p => ({ ...p, t: p.t + 600e3 }));
const s2 = summarize([pts.slice(0, half), paused]);
assert(Math.abs(s2.minutes - s.minutes) < 0.2, '일시정지 시간 빼기');

// 멈춰 있으면(같은 자리) 시간 안 셈
const still = Array.from({ length: 20 }, (_, i) => ({ t: i * 3000, lat: 37.5, lng: 127, acc: 5 }));
assert(summarize([still]).minutes === 0);

// 프라이버시 구역: 출발·도착 200m 안 점은 없음
const tr = trim(pts);
assert(tr.length && tr.every(p => dist(p, pts[0]) > 200 && dist(p, pts.at(-1)) > 200));
// 지금 페이스: 끝부분 30초로 5:30 근처, 멈춰 있으면 0
assert(Math.abs(recentPace(pts) - 330) < 30, `지금 페이스 ${recentPace(pts)}`);
assert(recentPace(still) === 0);
console.log('ok');

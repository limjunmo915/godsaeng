// 운동·신체 계산식과 사람 표시 도구
import { S } from '../state.js';
import { TYPES, typeOf, points } from './types.js';
import { DAY, esc, fmtNum, startOf, dayKey } from './util.js';

export const sum = list => list.reduce((a, w) => ({
  count: a.count + 1, minutes: a.minutes + (+w.duration_min || 0), kcal: a.kcal + (+w.kcal || 0),
  distance: a.distance + (+w.distance_km || 0), elev: a.elev + (+w.elev_m || 0), points: a.points + points(w),
}), { count: 0, minutes: 0, kcal: 0, distance: 0, elev: 0, points: 0 });

// 신체 정보 (본인 전용 테이블에서)
export const latest = k => S.body.logs.findLast(l => l[k] != null)?.[k] ?? null;
export const age = () => S.body.p?.birth_year ? new Date().getFullYear() - S.body.p.birth_year : null;
// 칼로리: 평균심박+나이+성별+체중이 있으면 Keytel(2005) 심박 공식, 없으면 MET×체중×시간
export function estKcal(type, min, hr) {
  const w = latest('weight_kg') || 70, a = age(), sex = S.body.p?.sex;
  if (hr && a && sex) {
    const perMin = sex === 'male' ? (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184 : (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184;
    if (perMin > 0) return Math.round(perMin * min);
  }
  return Math.round((TYPES[type]?.met || 4) * w * min / 60);
}
// 기초대사량: Mifflin-St Jeor
export function bmr() {
  const w = latest('weight_kg'), h = S.body.p?.height_cm, a = age(), sex = S.body.p?.sex;
  return w && h && a && sex ? Math.round(10 * w + 6.25 * h - 5 * a + (sex === 'male' ? 5 : -161)) : null;
}
export function pace(w) {
  const t = TYPES[w.type]; if (!t?.pace || !+w.distance_km) return null;
  const km = +w.distance_km, min = +w.duration_min;
  if (t.pace === 'kmh') return ['평균속도', fmtNum(km / (min / 60), 1) + ' km/h'];
  const per = t.pace === '100m' ? min / (km * 10) : min / km;
  let mm = Math.floor(per), ss = Math.round((per - mm) * 60); if (ss === 60) { mm++; ss = 0; }
  return ['페이스', `${mm}'${String(ss).padStart(2, '0')}"/${t.pace === '100m' ? '100m' : 'km'}`];
}
// 상대적 노력: 심박 기반 TRIMP (안정 60, 최대 190 가정)
// ponytail: 안정/최대 심박 고정값. 개인 설정이 필요해지면 내 몸 탭의 안정시 심박·나이로 계산
export function effort(w) {
  if (!w.avg_hr) return 0;
  const r = Math.min(1, Math.max(0, (w.avg_hr - 60) / (190 - 60)));
  return Math.round(w.duration_min * r * 0.64 * Math.exp(1.92 * r));
}

export function streaks(list) {
  const days = new Set(list.map(w => dayKey(w.started_at)));
  const d = new Date(); if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let daily = 0; while (days.has(dayKey(d))) { daily++; d.setDate(d.getDate() - 1); }
  // 스트라바식 주간 스트릭: 월~일 사이 1회 이상 운동한 주가 연속된 수
  const weeks = new Set(list.map(w => startOf('week', new Date(w.started_at))));
  let wk = startOf('week'); if (!weeks.has(wk)) wk -= 7 * DAY;
  let weekly = 0; while (weeks.has(wk)) { weekly++; wk = startOf('week', new Date(wk - 3 * DAY)); }
  let best = 0, run = 0, prev = null;
  for (const k of [...new Set(list.map(w => startOf('day', new Date(w.started_at))))].sort((a, b) => a - b)) {
    run = prev !== null && Math.round((k - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k;
  }
  return { daily, weekly, best };
}
export function badges(list, st) {
  const all = sum(list), runs = list.filter(w => w.type === 'run'), hours = list.map(w => new Date(w.started_at).getHours());
  const maxRun = Math.max(0, ...runs.map(w => +w.distance_km));
  return [
    ['walk', '첫 걸음', list.length >= 1], ['calendar-stats', '10회 출석', list.length >= 10], ['trophy', '100회 출석', list.length >= 100],
    ['run', '5K 클럽', maxRun >= 5], ['bolt', '10K 전사', maxRun >= 10], ['medal', '하프 마라토너', maxRun >= 21.0975], ['crown', '풀 마라토너', maxRun >= 42.195],
    ['sun', '아침형 인간', hours.some(h => h >= 4 && h < 7)], ['moon', '올빼미', hours.some(h => h >= 22 || h < 2)],
    ['flame', '7일 연속', st.best >= 7], ['calendar', '4주 연속', st.weekly >= 4], ['route', '누적 100km', all.distance >= 100],
    ['stopwatch', '누적 50시간', all.minutes >= 3000], ['mountain', '누적 상승 1000m', all.elev >= 1000], ['sparkles', '팔방미인 5종목', new Set(list.map(w => w.type)).size >= 5],
  ];
}

export const nameOf = id => id === S.uid ? '나' : (S.people[id]?.nickname || '누군가');
export const crew = () => S.crews.find(c => c.id === S.crewId);
export function avatar(id, cls = '') {
  const p = S.people[id];
  const src = p?.avatar_url && S.urls[p.avatar_url];   // 서명 주소(data.js signAvatars). 외부 주소는 쓰지 않음
  if (src) return `<img class="av ${cls}" alt="" src="${esc(src)}">`;
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="av ${cls}" style="--h:${h}" aria-hidden="true">${esc((p?.nickname || '?').slice(0, 1))}</span>`;
}
export const typeLabel = k => typeOf(k).label;

// 종목·반응·문구 등 고정 데이터
import { fmtDur, fmtNum } from './util.js';

// 스트라바 SportType 56종 + 기존 키(ball, etc). 키는 DB 에 저장되므로 바꾸지 말 것.
// [키, 이름, 아이콘, MET(성인 운동량 개요 근사), 페이스 표시(km | kmh | 100m, 없으면 거리 없음), 최고속도 km/h(넘으면 차 탄 걸로 보고 거부)]
export const TYPE_GROUPS = {
  '달리기·걷기': [['run', '달리기', 'run', 9.8, 'km', 25], ['trail', '트레일 러닝', 'trekking', 9.0, 'km', 25], ['vrun', '러닝머신', 'treadmill', 9.0, 'km', 25],
    ['walk', '걷기', 'walk', 3.5, 'km', 10], ['hike', '등산', 'mountain', 6.5, 'km', 12], ['wheelchair', '휠체어', 'wheelchair', 4.0, 'kmh', 30]],
  '자전거': [['ride', '자전거', 'bike', 7.5, 'kmh', 80], ['mtb', '산악자전거', 'bike', 8.5, 'kmh', 70], ['gravel', '그래블 라이드', 'bike', 7.5, 'kmh', 70],
    ['ebike', '전기자전거', 'bolt', 4.0, 'kmh', 60], ['emtb', '전기 산악자전거', 'bolt', 5.0, 'kmh', 60], ['vride', '실내 자전거', 'bike', 6.8, 'kmh', 80],
    ['handcycle', '핸드사이클', 'wheel', 6.0, 'kmh', 50], ['velomobile', '벨로모빌', 'bike', 6.0, 'kmh', 90]],
  '수상': [['swim', '수영', 'swimming', 7.0, '100m', 8], ['rowing', '조정', 'kayak', 7.0, 'kmh', 25], ['vrow', '실내 로잉', 'kayak', 6.0, 'kmh', 25],
    ['kayak', '카약', 'kayak', 5.0, 'kmh', 20], ['canoe', '카누', 'kayak', 4.0, 'kmh', 20], ['sup', '패들보드(SUP)', 'wave-sine', 6.0, 'kmh', 15],
    ['surf', '서핑', 'wave-sine', 3.0], ['kitesurf', '카이트서핑', 'wind', 6.0, 'kmh', 80], ['windsurf', '윈드서핑', 'wind', 5.0, 'kmh', 70], ['sail', '요트', 'sailboat', 3.0, 'kmh', 50]],
  '겨울·스케이트': [['alpine', '알파인 스키', 'ski-jumping', 5.3, 'kmh', 130], ['backcountry', '백컨트리 스키', 'ski-jumping', 8.0, 'kmh', 60], ['nordic', '크로스컨트리 스키', 'ski-jumping', 9.0, 'kmh', 40],
    ['snowboard', '스노보드', 'snowboarding', 5.3, 'kmh', 130], ['snowshoe', '스노슈잉', 'snowflake', 7.0, 'km', 10], ['iceskate', '아이스 스케이트', 'ice-skating', 7.0, 'kmh', 50],
    ['rollerski', '롤러스키', 'ski-jumping', 8.0, 'kmh', 40], ['inline', '인라인 스케이트', 'roller-skating', 7.5, 'kmh', 50], ['skateboard', '스케이트보드', 'skateboarding', 5.0, 'kmh', 40]],
  '피트니스': [['gym', '웨이트 트레이닝', 'barbell', 5.0], ['crossfit', '크로스핏', 'weight', 8.0], ['hiit', 'HIIT', 'flame', 8.0], ['home', '홈트·기타 운동', 'stretching', 4.5],
    ['elliptical', '일립티컬', 'activity', 5.0], ['stair', '스텝퍼(천국의 계단)', 'stairs-up', 9.0], ['yoga', '요가', 'yoga', 3.0], ['pilates', '필라테스', 'stretching-2', 3.0],
    ['dance', '댄스', 'music', 5.5], ['climbing', '클라이밍', 'mountain', 8.0], ['physio', '재활 운동', 'first-aid-kit', 3.0]],
  '라켓·구기': [['tennis', '테니스', 'ball-tennis', 7.3], ['badminton', '배드민턴', 'ball-tennis', 5.5], ['tabletennis', '탁구', 'ping-pong', 4.0], ['squash', '스쿼시', 'ball-tennis', 7.3],
    ['racquetball', '라켓볼', 'ball-tennis', 7.0], ['padel', '파델', 'ball-tennis', 6.0], ['pickleball', '피클볼', 'ping-pong', 4.1], ['soccer', '축구·풋살', 'ball-football', 7.0],
    ['basketball', '농구', 'ball-basketball', 6.5], ['volleyball', '배구', 'ball-volleyball', 4.0], ['cricket', '크리켓', 'cricket', 4.8], ['golf', '골프', 'golf', 4.8], ['ball', '기타 구기', 'ball-baseball', 7.0]],
  '기타': [['etc', '기타', 'sparkles', 4.0]],
};
export const TYPES = Object.fromEntries(Object.values(TYPE_GROUPS).flat().map(([k, label, icon, met, pace, vmax]) => [k, { label, icon, met, pace, vmax, dist: !!pace }]));
export const typeOf = k => TYPES[k] || TYPES.etc;
export const QUICK_DEFAULT = ['run', 'walk', 'ride', 'swim', 'gym', 'tennis'];

// 반응: [아이콘, 이름]
export const REACTS = { fire: ['flame', '인정'], mad: ['mood-angry', '질 수 없다'], meh: ['mood-annoyed', '그게 다야?'], sofa: ['sofa', '누워있음'] };
export const BRAGS = ['나 이만큼 했지롱 😝', '너넨 오늘 뭐 했냐?', '부럽지? 부러우면 뛰어', '갓생 1일 추가요', '이 정도는 몸풀기지'];
export const POKES = ['오늘도 누워있니? 🛋️', '소파랑 결혼했어? 💍', '나 벌써 끝냈는데~ 😏', '운동화 먼지 쌓였겠다 👟', '이번 주 꼴찌 예약이요 🐢', '숨쉬기 운동은 기록 안 돼요 🫁'];

// 갓생 포인트: 운동 강도(MET) × 분 ÷ 10. 산책 1시간 21P, 테니스 1시간 44P, 달리기 1시간 59P
export const points = w => typeOf(w.type).met * (+w.duration_min || 0) / 10;

// 랭킹·챌린지 기준. challenge: false 는 DB 의 챌린지 기준 목록에 없어서 챌린지에선 못 씀
export const METRIC = {
  points: { label: '갓생 포인트', short: '포인트', fmt: v => fmtNum(v) + 'P', get: points, challenge: false },
  minutes: { label: '시간', short: '시간', fmt: v => fmtDur(v), get: w => +w.duration_min, unit: '분' },
  distance: { label: '거리', short: '거리', fmt: v => fmtNum(v, 1) + ' km', get: w => +w.distance_km, unit: 'km' },
  kcal: { label: '칼로리', short: '칼로리', fmt: v => fmtNum(v) + ' kcal', get: w => +w.kcal, unit: 'kcal' },
  count: { label: '횟수', short: '횟수', fmt: v => v + '회', get: () => 1, unit: '회' },
};

export const BODY = {
  weight_kg: { label: '체중', unit: 'kg', d: 1 }, body_fat_pct: { label: '체지방률', unit: '%', d: 1 },
  muscle_kg: { label: '골격근량', unit: 'kg', d: 1 }, waist_cm: { label: '허리둘레', unit: 'cm', d: 1 }, resting_hr: { label: '안정시 심박', unit: 'bpm', d: 0 },
};

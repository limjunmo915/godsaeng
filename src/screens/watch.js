// 워치 기록 불러오기(안드로이드 앱만): 갤럭시워치·삼성 헬스·핏빗 등이 Health Connect 에 남긴 최근 14일 운동을 골라 기록 화면에 채움
// 읽기만 함(쓰기 없음). 심박은 건강정보 동의한 사람만 요청. 이미 올린 운동은 이 폰에 기억해서 다시 안 보임
import { Capacitor } from '@capacitor/core';
import { Health } from 'capacitor-health';
import { S, sb, $ } from '../state.js';
import { sportIc } from '../lib/icons.js';
import { DAY, esc, fmtDate, fmtTime, fmtClock, lsGet, lsSet, toast, fail } from '../lib/util.js';
import { TYPES } from '../lib/types.js';
import { fillAuto } from './log.js';

// Health Connect 운동 종류 → 우리 종목
const HC = { RUNNING: 'run', RUNNING_TREADMILL: 'vrun', WALKING: 'walk', HIKING: 'hike', WHEELCHAIR: 'wheelchair', BIKING: 'ride', BIKING_STATIONARY: 'vride',
  SWIMMING_POOL: 'swim', SWIMMING_OPEN_WATER: 'swim', ROWING: 'rowing', ROWING_MACHINE: 'vrow', PADDLING: 'kayak', SAILING: 'sail', SURFING: 'surf',
  SKIING: 'alpine', SNOWBOARDING: 'snowboard', SNOWSHOEING: 'snowshoe', ICE_SKATING: 'iceskate', SKATING: 'inline',
  STRENGTH_TRAINING: 'gym', WEIGHTLIFTING: 'gym', CALISTHENICS: 'home', HIGH_INTENSITY_INTERVAL_TRAINING: 'hiit', BOOT_CAMP: 'hiit', EXERCISE_CLASS: 'home',
  STRETCHING: 'home', ELLIPTICAL: 'elliptical', STAIR_CLIMBING: 'stair', STAIR_CLIMBING_MACHINE: 'stair', PILATES: 'pilates', DANCING: 'dance',
  ROCK_CLIMBING: 'climbing', BOXING: 'boxing', MARTIAL_ARTS: 'martial', TENNIS: 'tennis', BADMINTON: 'badminton', TABLE_TENNIS: 'tabletennis',
  SQUASH: 'squash', RACQUETBALL: 'racquetball', SOCCER: 'soccer', BASKETBALL: 'basketball', VOLLEYBALL: 'volleyball', BASEBALL: 'baseball',
  SOFTBALL: 'baseball', CRICKET: 'cricket', GOLF: 'golf' };
const done = () => JSON.parse(lsGet('hcDone') || '[]');
export const markImported = id => lsSet('hcDone', JSON.stringify([...done(), id].slice(-300)));
export const watchReady = () => Capacitor.isNativePlatform();
let list = [];

async function load() {
  const { available } = await Health.isHealthAvailable();
  if (!available) { toast('Health Connect 앱이 필요해요. 설치 화면으로 갈게요.'); return Health.showHealthConnectInPlayStore(); }
  const hr = !!S.consents.health;
  await Health.requestHealthPermissions({ permissions: ['READ_WORKOUTS', 'READ_DISTANCE', 'READ_TOTAL_CALORIES', 'READ_ACTIVE_CALORIES', ...(hr ? ['READ_HEART_RATE'] : [])] });
  const end = new Date(), { workouts } = await Health.queryWorkouts({ startDate: new Date(end - 14 * DAY).toISOString(), endDate: end.toISOString(), includeHeartRate: hr, includeRoute: false, includeSteps: false });
  // 이미 올린 워치 운동(자동 올리기 포함, supabase/016 ext_id)은 빼기. SQL 실행 전이면 이 폰 기억만
  const { data: up } = await sb.from('workouts').select('ext_id').eq('user_id', S.uid).not('ext_id', 'is', null);
  const seen = [...done(), ...(up || []).map(x => x.ext_id)];
  list = workouts.filter(w => !seen.includes(w.id)).map(w => ({
    id: w.id, type: HC[w.workoutType] || 'etc', start: w.startDate, minutes: (w.duration || 0) / 60, km: (w.distance || 0) / 1000, kcal: w.calories || 0,
    hr: w.heartRate?.length ? w.heartRate.reduce((a, b) => a + b.bpm, 0) / w.heartRate.length : 0,
    src: /samsung/i.test(w.sourceBundleId) ? '삼성 헬스' : /fitbit/i.test(w.sourceBundleId) ? '핏빗' : /garmin/i.test(w.sourceBundleId) ? '가민' : '워치',
  })).sort((a, b) => new Date(b.start) - new Date(a.start));
}
function draw() {
  $('#watch-list').innerHTML = list.length ? list.map((w, i) => `<button type="button" class="frow watch-row" data-act="watch-pick" data-i="${i}">
      ${sportIc(w.type, TYPES[w.type].icon)}<span class="nm"><span>${TYPES[w.type].label} · ${fmtDate(w.start)} ${fmtTime(w.start)}<small>${esc(w.src)} · ${fmtClock(w.minutes)}${w.km ? ` · ${w.km.toFixed(2)} km` : ''}${w.kcal ? ` · ${Math.round(w.kcal)} kcal` : ''}${w.hr ? ` · 평균 심박 ${Math.round(w.hr)}` : ''}</small></span></span></button>`).join('')
    : '<p class="hint">최근 14일 동안 새로 불러올 운동이 없어요. 갤럭시워치는 삼성 헬스 → 설정 → Health Connect 에서 운동 데이터 공유를 켜 주세요.</p>';
}
export const actions = {
  'watch-open': async () => {
    try { $('#watch-list').innerHTML = '<p class="hint">불러오는 중…</p>'; $('#watch-dlg').showModal(); await load(); draw(); }
    catch (err) { $('#watch-dlg').close(); fail(err, '워치 기록을 불러오지 못했어요. 권한을 허용했는지 확인해 주세요.'); }
  },
  'watch-close': () => $('#watch-dlg').close(),
  'watch-pick': b => { const w = list[b.dataset.i]; $('#watch-dlg').close(); fillAuto({ ...w, extId: w.id }); },
};

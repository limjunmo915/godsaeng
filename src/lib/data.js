// 서버에서 데이터 불러오기
import { S, sb, ok } from '../state.js';
import { DAY, lsGet } from './util.js';

export async function loadCore() {
  let me = ok(await sb.from('profiles').select('*').eq('id', S.uid).maybeSingle());
  if (!me) me = ok(await sb.from('profiles').insert({ id: S.uid }).select().single());
  const rows = ok(await sb.from('crew_members').select('crew_id, user_id, crews(*), profiles(*)'));
  S.me = me; S.people = { [me.id]: me }; S.crews = []; S.members = {};
  for (const r of rows) {
    if (r.profiles) S.people[r.user_id] = r.profiles;
    (S.members[r.crew_id] ??= []).push(r.user_id);
    if (r.crews && !S.crews.some(c => c.id === r.crew_id)) S.crews.push(r.crews);
  }
  S.crewId = S.crews.find(c => c.id === lsGet('crew'))?.id || S.crews[0]?.id || null;
  await loadGear();
}
export async function loadGear() {
  S.gear = ok(await sb.from('gear').select('*').eq('user_id', S.uid).order('created_at'));
}
export async function signPhotos(paths) {
  const need = [...new Set(paths)].filter(p => !S.urls[p]);
  if (!need.length) return;
  const res = ok(await sb.storage.from('photos').createSignedUrls(need, 6 * 3600));
  for (const r of res) if (r.signedUrl) S.urls[r.path] = r.signedUrl;
}
const FEED_SEL = '*, reactions(user_id,kind), comments(id,user_id,body,created_at)';
export async function loadFeed(reset) {
  if (reset) { S.feed = []; S.feedEnd = false; }
  // 남의 기록은 crew_workouts(서버가 숨긴 심박·칼로리를 빈칸으로 보냄)로만 읽음 → supabase/004
  const rows = ok(await sb.rpc('crew_workouts').select(FEED_SEL)
    .order('started_at', { ascending: false }).order('created_at', { referencedTable: 'comments' })
    .range(S.feed.length, S.feed.length + 19));
  S.feed.push(...rows); S.feedEnd = rows.length < 20;
  await signPhotos(rows.flatMap(w => w.photos));
}
// ponytail: 내 기록 전체를 한 번에 가져옴(기본 상한 1000건). 수년치 쌓이면 기간별 조회로 변경
export async function loadMine() {
  const [mine, notes] = await Promise.all([
    sb.from('workouts').select('id,type,title,memo,brag,started_at,duration_min,distance_km,elev_m,kcal,avg_hr,rpe,gear_id,photos').eq('user_id', S.uid).order('started_at', { ascending: false }).then(ok),
    sb.from('private_notes').select('workout_id,note').then(ok),
  ]);
  S.mine = mine; S.notes = Object.fromEntries(notes.map(n => [n.workout_id, n.note]));
}
export async function loadBody() {
  const [p, logs] = await Promise.all([
    sb.from('body_profile').select('*').eq('user_id', S.uid).maybeSingle().then(ok),
    sb.from('body_logs').select('*').eq('user_id', S.uid).order('measured_on').then(ok),
  ]);
  S.body = { p, logs };
}
// 크루 멤버별 기록 묶음 (크루 공개 기록만)
// ponytail: 폰에서 합산. 크루가 커지면 서버 함수(RPC)로 집계
export async function crewTotals(from, to = Date.now() + DAY, crewId = S.crewId) {
  const ids = S.members[crewId] || [];
  const rows = ids.length ? ok(await sb.rpc('crew_workouts').select('user_id,type,duration_min,distance_km,kcal,started_at')
    .eq('visibility', 'crew').in('user_id', ids).gte('started_at', new Date(from).toISOString()).lt('started_at', new Date(to).toISOString())) : [];
  const by = Object.fromEntries(ids.map(id => [id, []]));
  for (const w of rows) by[w.user_id]?.push(w);
  return by;
}

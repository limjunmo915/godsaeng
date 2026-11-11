// 서버에서 데이터 불러오기
import { decodePoly } from './gps.js';
import { S, sb, ok } from '../state.js';
import { DAY, lsGet, lsSet } from './util.js';

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
  await Promise.all([loadGear(), loadBlocks(), loadFollows().then(() => signAvatars()).catch(console.error)]);
}
// 팔로우(supabase/009): 내가 팔로우한 사람 / 나를 팔로우한 사람. 서로면 친구
export async function loadFollows() {
  const rows = ok(await sb.from('follows').select('follower,followee,created_at'));
  S.following = rows.filter(r => r.follower === S.uid).map(r => r.followee);
  S.followers = rows.filter(r => r.followee === S.uid).map(r => r.follower);
  S.followedAt = Object.fromEntries(rows.filter(r => r.followee === S.uid).map(r => [r.follower, r.created_at]));
  const need = [...new Set([...S.following, ...S.followers])].filter(id => !S.people[id]);
  if (need.length) for (const p of ok(await sb.from('profiles').select('*').in('id', need))) S.people[p.id] = p;
}
// 내가 차단한 사람(supabase/007). 이 사람들의 기록·댓글·약올리기는 화면에서 숨김
export async function loadBlocks() {
  S.blocked = ok(await sb.from('blocks').select('blocked')).map(r => r.blocked);
}
// 프로필 사진: 서명 주소를 7일 동안 폰에 저장 → 주소가 같으니 브라우저 캐시를 써서 매번 다시 받지 않음
const AV_TTL = 7 * DAY;
export async function signAvatars() {
  let cache; try { cache = JSON.parse(lsGet('av')) || {}; } catch { cache = {}; }
  const now = Date.now(), paths = Object.values(S.people).map(p => p.avatar_url).filter(Boolean);
  const need = paths.filter(p => !(cache[p]?.exp > now + DAY));
  if (need.length) for (const r of ok(await sb.storage.from('photos').createSignedUrls(need, AV_TTL / 1000)))
    if (r.signedUrl) cache[r.path] = { url: r.signedUrl, exp: now + AV_TTL };
  for (const k in cache) if (!paths.includes(k)) delete cache[k];
  lsSet('av', JSON.stringify(cache));
  for (const p of paths) if (cache[p]) S.urls[p] = cache[p].url;
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
export const FEED_SEL = '*, reactions(user_id,kind), comments(id,user_id,body,created_at)';
export async function loadFeed(reset) {
  if (reset) { S.feed = []; S.feedEnd = false; S.feedAt = Date.now(); }
  // 남의 기록은 crew_workouts(서버가 숨긴 심박·칼로리를 빈칸으로 보냄)로만 읽음 → supabase/004
  const rows = ok(await sb.rpc('crew_workouts').select(FEED_SEL)
    .order('started_at', { ascending: false }).order('created_at', { referencedTable: 'comments' })
    .range(S.feed.length, S.feed.length + 19));
  S.feed.push(...rows); S.feedEnd = rows.length < 20;
  await Promise.all([signPhotos(rows.flatMap(w => w.photos)), loadRoutes(rows.map(w => w.id)), loadTogether(rows.map(w => w.id)), loadCmLikes(rows)]);
}
// ponytail: 내 기록 전체를 한 번에 가져옴(기본 상한 1000건). 수년치 쌓이면 기간별 조회로 변경
// 경로(supabase/015 routes_of): 볼 수 있는 기록 것만, 남의 경로는 서버가 '제공 사실'을 기록. SQL 실행 전이면 조용히 넘어감
export async function loadRoutes(ids) {
  S.routes ??= {}; if (!ids.length) return;
  const { data } = await sb.rpc('routes_of', { ids });
  for (const r of data || []) S.routes[r.workout_id] = decodePoly(r.poly);
}
// 함께한 사람(supabase/017 together_of): 기록 id → [{ id, partner, name, status, asked_by }]. SQL 실행 전이면 조용히 넘어감
export async function loadTogether(ids) {
  S.tg ??= {}; if (!ids.length) return;
  const { data, error } = await sb.rpc('together_of', { ids }); if (error) return;
  for (const id of ids) S.tg[id] = [];
  for (const r of data) S.tg[r.workout_id].push(r);
}
// 댓글 하트(supabase/018): 댓글 id → 누른 사람들. SQL 실행 전이면 조용히 넘어감
export async function loadCmLikes(rows) {
  S.cl ??= {}; const ids = rows.flatMap(w => (w.comments || []).map(c => c.id)); if (!ids.length) return;
  const { data, error } = await sb.from('comment_likes').select('comment_id,user_id').in('comment_id', ids); if (error) return;
  for (const id of ids) S.cl[id] = [];
  for (const r of data) S.cl[r.comment_id].push(r.user_id);
}
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
export const isFriend = id => S.following.includes(id) && S.followers.includes(id);

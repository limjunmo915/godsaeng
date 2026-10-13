// 갓생살기 프로젝트 — 앱 로직 (빌드 도구 없이 동작하는 순수 JS)
// anon 키는 공개용. 실제 보안은 schema.sql 의 RLS 규칙이 담당.
const SUPABASE_URL = 'https://ghrjtbznjnvzwqthiahm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdocmp0Ynpuam52endxdGhpYWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc1NDAsImV4cCI6MjEwNzQxMzU0MH0.Q2M1w4dzgmfc28voCetOP4UyOjEwF6ZDqOnC5hC5FMc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// vmax: 이 속도(km/h)를 넘으면 차 타고 기록한 걸로 보고 거부
const TYPES = {
  run:  {label:'달리기', icon:'🏃', met:9.8, dist:true, pace:'km', vmax:25},
  walk: {label:'걷기', icon:'🚶', met:3.5, dist:true, pace:'km', vmax:10},
  ride: {label:'자전거', icon:'🚴', met:7.5, dist:true, pace:'kmh', vmax:80},
  swim: {label:'수영', icon:'🏊', met:7.0, dist:true, pace:'100m', vmax:8},
  hike: {label:'등산', icon:'🥾', met:6.5, dist:true, pace:'km', vmax:12},
  gym:  {label:'웨이트', icon:'🏋️', met:5.0},
  home: {label:'홈트', icon:'🤸', met:4.5},
  yoga: {label:'요가·필라테스', icon:'🧘', met:3.0},
  ball: {label:'구기종목', icon:'⚽', met:7.0},
  etc:  {label:'기타', icon:'✨', met:4.0},
};
const REACTS = {fire:'🔥 인정', mad:'😤 질 수 없다', meh:'🙄 그게 다야?', sofa:'🛋️ 난 누워있음'};
const BRAGS = ['나 이만큼 했지롱 😝','너넨 오늘 뭐 했냐?','부럽지? 부러우면 뛰어','갓생 1일 추가요','이 정도는 몸풀기지'];
const POKES = ['오늘도 누워있니? 🛋️','소파랑 결혼했어? 💍','나 벌써 끝냈는데~ 😏','운동화 먼지 쌓였겠다 👟','이번 주 꼴찌 예약이요 🐢','숨쉬기 운동은 기록 안 돼요 🫁'];
const METRIC = {
  minutes:{label:'시간', fmt:v=>fmtDur(v), get:w=>+w.duration_min},
  distance:{label:'거리', fmt:v=>fmtNum(v,1)+' km', get:w=>+w.distance_km},
  kcal:{label:'칼로리', fmt:v=>fmtNum(v)+' kcal', get:w=>+w.kcal},
  count:{label:'횟수', fmt:v=>v+'회', get:()=>1},
};
const DAY = 864e5;

const S = {
  uid:undefined, me:null, crews:[], crewId:null, people:{}, members:{},
  feed:[], feedEnd:false, mine:[], notes:{}, gear:[], urls:{},
  tab:'feed', rPeriod:'week', rMetric:'minutes', calMonth:null,
  editing:null, newPhotos:[], keptPhotos:[], loginMode:'in',
  body:{p:null, logs:[]}, meTab:'stats', bodyMetric:'weight_kg',
};
const BODY = {
  weight_kg:{label:'체중', unit:'kg', d:1}, body_fat_pct:{label:'체지방률', unit:'%', d:1},
  muscle_kg:{label:'골격근량', unit:'kg', d:1}, waist_cm:{label:'허리둘레', unit:'cm', d:1}, resting_hr:{label:'안정시 심박', unit:'bpm', d:0},
};

/* ───────── 유틸 ───────── */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick = a => a[Math.floor(Math.random()*a.length)];
const ok = ({data, error}) => { if (error) throw error; return data; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const fmtDur = m => { m = Math.round(m); const h = Math.floor(m/60); return h ? `${h}시간 ${m%60}분` : `${m}분`; };
// 기록 상세용: 29분 44초 / 1시간 5분 3초
const fmtDurS = m => { const t = Math.round(m*60), h = Math.floor(t/3600), mm = Math.floor(t%3600/60), s = t%60;
  return [h && `${h}시간`, mm && `${mm}분`, s && `${s}초`].filter(Boolean).join(' ') || '0분'; };
// 입력칸용: 29:44 / 1:05:03
const fmtClock = m => { const t = Math.round(m*60), h = Math.floor(t/3600), mm = Math.floor(t%3600/60), s = String(t%60).padStart(2,'0');
  return h ? `${h}:${String(mm).padStart(2,'0')}:${s}` : `${mm}:${s}`; };
// "29:44"=분:초, "1:05:00"=시:분:초, "45"=45분, "1시간 5분 3초"/"29분 44초"도 허용 → 분(소수)
function parseDur(s){
  s = s.trim(); if (!s) return 0;
  const u = s.match(/^(?:(\d+)\s*(?:시간|h))?\s*(?:(\d+)\s*(?:분|m))?\s*(?:(\d+)\s*(?:초|s))?$/i);
  if (u && (u[1] || u[2] || u[3])) return (+u[1]||0)*60 + (+u[2]||0) + (+u[3]||0)/60;
  const p = s.split(/[:\s]+/).map(Number);
  if (p.length > 3 || p.some(x => !Number.isFinite(x) || x < 0) || p.slice(1).some(x => x >= 60)) return 0;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] + p[1]/60 : p[0]*60 + p[1] + p[2]/60;
}
const fmtDist = w => w.type === 'swim' ? fmtNum(w.distance_km*1000)+' m' : fmtNum(w.distance_km,2)+' km';
const fmtNum = (v, d=0) => Number(v||0).toLocaleString('ko-KR', {maximumFractionDigits:d, minimumFractionDigits:d});
const fmtDate = ts => new Date(ts).toLocaleDateString('ko-KR', {month:'long', day:'numeric', weekday:'short'});
function ago(ts){
  const s = (Date.now() - new Date(ts))/1000;
  if (s < 60) return '방금'; if (s < 3600) return Math.floor(s/60)+'분 전';
  if (s < DAY/1000) return Math.floor(s/3600)+'시간 전'; if (s < 7*DAY/1000) return Math.floor(s/86400)+'일 전';
  return fmtDate(ts);
}
function startOf(kind, d = new Date()){
  d = new Date(d); d.setHours(0,0,0,0);
  if (kind === 'week') d.setDate(d.getDate() - (d.getDay()+6)%7);
  else if (kind === 'month') d.setDate(1);
  else if (kind === 'year') d.setMonth(0, 1);
  return d.getTime();
}
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const sum = list => list.reduce((a,w) => ({count:a.count+1, minutes:a.minutes+(+w.duration_min||0), kcal:a.kcal+(+w.kcal||0), distance:a.distance+(+w.distance_km||0), elev:a.elev+(+w.elev_m||0)}), {count:0,minutes:0,kcal:0,distance:0,elev:0});
// 신체 정보 (본인 전용 테이블에서)
const latest = k => S.body.logs.findLast(l => l[k] != null)?.[k] ?? null;
const age = () => S.body.p?.birth_year ? new Date().getFullYear() - S.body.p.birth_year : null;
// 칼로리: 평균심박+나이+성별+체중이 있으면 Keytel(2005) 심박 공식, 없으면 MET×체중×시간
function estKcal(type, min, hr){
  const w = latest('weight_kg') || 70, a = age(), sex = S.body.p?.sex;
  if (hr && a && sex){
    const perMin = sex === 'male' ? (-55.0969 + 0.6309*hr + 0.1988*w + 0.2017*a)/4.184 : (-20.4022 + 0.4472*hr - 0.1263*w + 0.074*a)/4.184;
    if (perMin > 0) return Math.round(perMin * min);
  }
  return Math.round((TYPES[type]?.met || 4) * w * min/60);
}
// 기초대사량: Mifflin-St Jeor
function bmr(){
  const w = latest('weight_kg'), h = S.body.p?.height_cm, a = age(), sex = S.body.p?.sex;
  return w && h && a && sex ? Math.round(10*w + 6.25*h - 5*a + (sex === 'male' ? 5 : -161)) : null;
}
const nameOf = id => id === S.uid ? '나' : (S.people[id]?.nickname || '누군가');
const crew = () => S.crews.find(c => c.id === S.crewId);

function avatar(id, cls=''){
  const p = S.people[id];
  if (p?.avatar_url) return `<img class="av ${cls}" alt="" src="${esc(p.avatar_url)}" referrerpolicy="no-referrer">`;
  let h = 0; for (const c of String(id)) h = (h*31 + c.charCodeAt(0)) % 360;
  return `<span class="av ${cls}" style="background:hsl(${h} 55% 45%)" aria-hidden="true">${esc((p?.nickname || '?').slice(0,1))}</span>`;
}
function pace(w){
  const t = TYPES[w.type]; if (!t?.pace || !+w.distance_km) return null;
  const km = +w.distance_km, min = +w.duration_min;
  if (t.pace === 'kmh') return ['평균속도', fmtNum(km/(min/60),1)+' km/h'];
  const per = t.pace === '100m' ? min/(km*10) : min/km;
  let mm = Math.floor(per), ss = Math.round((per-mm)*60); if (ss === 60){ mm++; ss = 0; }
  return ['페이스', `${mm}'${String(ss).padStart(2,'0')}"/${t.pace === '100m' ? '100m' : 'km'}`];
}
// 상대적 노력: 심박 기반 TRIMP (안정 60, 최대 190 가정)
// ponytail: 안정/최대 심박 고정값. 개인 설정이 필요해지면 profiles 에 컬럼 추가
function effort(w){
  if (!w.avg_hr) return 0;
  const r = Math.min(1, Math.max(0, (w.avg_hr - 60)/(190 - 60)));
  return Math.round(w.duration_min * r * 0.64 * Math.exp(1.92 * r));
}
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }
function fail(err, fallback='실패했어요. 잠시 후 다시 시도해 주세요.'){
  console.error(err);
  const m = err?.message || '';
  toast(/초대코드|1분에 한 번/.test(m) ? m : /Invalid login/.test(m) ? '이메일 또는 비밀번호가 맞지 않아요.' : /already registered/.test(m) ? '이미 가입된 이메일이에요. 로그인해 주세요.' : /Email not confirmed/.test(m) ? '메일함에서 가입 확인 링크를 먼저 눌러 주세요.' : /provider is not enabled/.test(m) ? '구글 로그인은 아직 준비 중이에요. 이메일로 가입해 주세요.' : fallback);
}

/* ───────── 로그인 ───────── */
function showLogin(){ $('#app').hidden = true; $('#login').hidden = false; }
$('#l-toggle').onclick = () => {
  S.loginMode = S.loginMode === 'in' ? 'up' : 'in';
  const up = S.loginMode === 'up';
  $('#l-nick-wrap').hidden = !up;
  $('#l-submit').textContent = up ? '가입하기' : '로그인';
  $('#l-toggle').textContent = up ? '이미 계정이 있어요 → 로그인' : '처음이에요 → 회원가입';
  $('#l-pw').autocomplete = up ? 'new-password' : 'current-password';
};
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const email = $('#l-email').value.trim(), password = $('#l-pw').value;
  if (!email || password.length < 6) return toast('이메일과 6자 이상 비밀번호를 입력해 주세요.');
  $('#l-submit').disabled = true;
  try {
    if (S.loginMode === 'up'){
      const nickname = $('#l-nick').value.trim() || email.split('@')[0];
      const data = ok(await sb.auth.signUp({email, password, options:{data:{nickname}, emailRedirectTo: location.origin + location.pathname}}));
      if (!data.session) toast('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
    } else ok(await sb.auth.signInWithPassword({email, password}));
  } catch (err) { fail(err); }
  finally { $('#l-submit').disabled = false; }
};
sb.auth.onAuthStateChange((_ev, session) => {
  const uid = session?.user?.id ?? null;
  if (uid === S.uid) return;
  S.uid = uid;
  // supabase-js 콜백 안에서 바로 쿼리하면 교착될 수 있어 다음 틱으로 미룸
  setTimeout(() => uid ? boot() : showLogin());
});

/* ───────── 부팅 / 데이터 로드 ───────── */
async function boot(){
  $('#login').hidden = true; $('#app').hidden = false;
  try {
    await loadCore();
    initForm();
    show(S.crews.length ? S.tab : 'crew');
    await Promise.all([loadFeed(true), loadMine(), loadBody()]);
    refresh(); syncForm();
    loadNotifs();
  } catch (err) { fail(err, '불러오지 못했어요. 새로고침해 주세요.'); }
}
async function loadCore(){
  let me = ok(await sb.from('profiles').select('*').eq('id', S.uid).maybeSingle());
  if (!me) me = ok(await sb.from('profiles').insert({id: S.uid}).select().single());
  const rows = ok(await sb.from('crew_members').select('crew_id, user_id, crews(*), profiles(*)'));
  S.me = me; S.people = {[me.id]: me}; S.crews = []; S.members = {};
  for (const r of rows){
    if (r.profiles) S.people[r.user_id] = r.profiles;
    (S.members[r.crew_id] ??= []).push(r.user_id);
    if (r.crews && !S.crews.some(c => c.id === r.crew_id)) S.crews.push(r.crews);
  }
  S.crewId = S.crews.find(c => c.id === lsGet('crew'))?.id || S.crews[0]?.id || null;
  S.gear = ok(await sb.from('gear').select('*').eq('user_id', S.uid).order('created_at'));
}
async function signPhotos(paths){
  const need = [...new Set(paths)].filter(p => !S.urls[p]);
  if (!need.length) return;
  const res = ok(await sb.storage.from('photos').createSignedUrls(need, 6*3600));
  for (const r of res) if (r.signedUrl) S.urls[r.path] = r.signedUrl;
}
const FEED_SEL = '*, reactions(user_id,kind), comments(id,user_id,body,created_at)';
async function loadFeed(reset){
  if (reset){ S.feed = []; S.feedEnd = false; }
  const rows = ok(await sb.from('workouts').select(FEED_SEL)
    .order('started_at', {ascending:false}).order('created_at', {referencedTable:'comments'})
    .range(S.feed.length, S.feed.length + 19));
  S.feed.push(...rows); S.feedEnd = rows.length < 20;
  await signPhotos(rows.flatMap(w => w.photos));
}
// ponytail: 내 기록 전체를 한 번에 가져옴(기본 상한 1000건). 수년치 쌓이면 기간별 조회로 변경
async function loadMine(){
  const [mine, notes] = await Promise.all([
    sb.from('workouts').select('id,type,title,started_at,duration_min,distance_km,elev_m,kcal,avg_hr,gear_id,photos').eq('user_id', S.uid).order('started_at', {ascending:false}).then(ok),
    sb.from('private_notes').select('workout_id,note').then(ok),
  ]);
  S.mine = mine; S.notes = Object.fromEntries(notes.map(n => [n.workout_id, n.note]));
}
async function loadBody(){
  const [p, logs] = await Promise.all([
    sb.from('body_profile').select('*').eq('user_id', S.uid).maybeSingle().then(ok),
    sb.from('body_logs').select('*').eq('user_id', S.uid).order('measured_on').then(ok),
  ]);
  S.body = {p, logs};
}
// 크루 멤버별 합계 (크루 공개 기록만)
async function crewTotals(from, to = Date.now() + DAY, crewId = S.crewId){
  const ids = S.members[crewId] || [];
  const rows = ids.length ? ok(await sb.from('workouts').select('user_id,duration_min,distance_km,kcal,started_at')
    .eq('visibility', 'crew').in('user_id', ids).gte('started_at', new Date(from).toISOString()).lt('started_at', new Date(to).toISOString())) : [];
  const by = Object.fromEntries(ids.map(id => [id, []]));
  for (const w of rows) by[w.user_id]?.push(w);
  return by;
}

/* ───────── 탭 ───────── */
function show(tab){
  S.tab = tab;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const v of ['feed','rank','log','crew','me']) $('#v-'+v).hidden = v !== tab;
  scrollTo({top:0});
  if (tab !== 'log') refresh();
}
function refresh(){
  const r = {feed:renderFeed, rank:renderRank, crew:renderCrew, me:renderMe}[S.tab];
  r?.().catch(err => fail(err, '화면을 그리지 못했어요.'));
}
document.querySelector('.tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab === 'log' && !S.editing) resetForm();
  show(b.dataset.tab);
};

/* ───────── 피드 ───────── */
function card(w){
  const t = TYPES[w.type] || TYPES.etc, mine = w.user_id === S.uid, hide = mine ? [] : (w.hide_stats || []);
  const stats = [];
  if (+w.distance_km) stats.push(['거리', fmtDist(w)]);
  const pc = pace(w); if (pc && !hide.includes('pace')) stats.push(pc);
  stats.push(['시간', fmtDurS(w.duration_min)]);
  if (!hide.includes('kcal')) stats.push(['칼로리', fmtNum(w.kcal)+' kcal']);
  if (+w.elev_m) stats.push(['상승고도', fmtNum(w.elev_m)+' m']);
  if (w.avg_hr && !hide.includes('hr')) stats.push(['평균심박', w.avg_hr+' bpm'], ['상대적 노력', effort(w)]);
  if (w.rpe) stats.push(['체감강도', w.rpe+'/10']);
  const myRx = w.reactions.find(r => r.user_id === S.uid)?.kind;
  const gear = mine && S.gear.find(g => g.id === w.gear_id);
  const tags = [
    w.visibility === 'private' ? '<span class="tag">🔒 나만 보기</span>' : '',
    w.tags?.includes('commute') ? '<span class="tag">출퇴근</span>' : '',
    gear ? `<span class="tag">👟 ${esc(gear.name)}</span>` : '',
    mine && hide.length === 0 && w.hide_stats?.length ? '<span class="tag">일부 항목 크루에 숨김</span>' : '',
  ].join('');
  const cms = w.comments || [], open = w._open || cms.length <= 2, shown = open ? cms : cms.slice(-2);
  return `<article class="card" data-wid="${w.id}">
    <div class="who">${avatar(w.user_id)}
      <div><strong>${esc(nameOf(w.user_id))}</strong><small>${t.icon} ${esc(t.label)} · ${fmtDate(w.started_at)} ${new Date(w.started_at).toLocaleTimeString('ko-KR',{hour:'numeric',minute:'2-digit'})}</small></div></div>
    ${w.title ? `<h3 class="title">${esc(w.title)}</h3>` : ''}
    <div class="stats">${stats.map(([k,v]) => `<div class="stat"><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
    ${tags.trim() ? `<div class="tags">${tags}</div>` : ''}
    ${w.brag ? `<div class="brag">${esc(w.brag)}</div>` : ''}
    ${w.photos?.length ? `<div class="photos ${w.photos.length > 1 ? 'multi' : ''}">${w.photos.map((p,i) => `<img alt="${esc(nameOf(w.user_id))}의 운동 사진 ${i+1}" src="${esc(S.urls[p] || '')}" loading="lazy">`).join('')}</div>` : ''}
    ${w.memo ? `<p class="memo">${esc(w.memo)}</p>` : ''}
    ${mine && S.notes[w.id] ? `<p class="note">🔒 ${esc(S.notes[w.id])}</p>` : ''}
    <div class="reacts">${Object.entries(REACTS).map(([k,label]) => {
      const n = w.reactions.filter(r => r.kind === k).length;
      return `<button class="chip" data-act="react" data-k="${k}" aria-pressed="${myRx===k}" ${mine ? 'disabled' : ''}>${label}${n ? ' <span class="num">'+n+'</span>' : ''}</button>`;
    }).join('')}</div>
    ${mine ? `<div class="actions"><button data-act="share">📸 약올리기 카드</button><button data-act="edit">수정</button><button data-act="del" class="danger">삭제</button></div>` : ''}
    <div class="comments">
      ${!open ? `<button class="linkbtn" data-act="more-cm">댓글 ${cms.length}개 모두 보기</button>` : ''}
      ${shown.map(c => `<div class="cm">${avatar(c.user_id,'sm')}<div><b>${esc(nameOf(c.user_id))}</b>${esc(c.body)}<small>${ago(c.created_at)}</small></div>
        ${c.user_id === S.uid || mine ? `<button data-act="del-cm" data-cid="${c.id}" aria-label="댓글 삭제">✕</button>` : ''}</div>`).join('')}
      <form class="inline cform"><input type="text" maxlength="300" placeholder="댓글로 약올리기…" aria-label="댓글"><button class="ghost">등록</button></form>
    </div>
  </article>`;
}
async function renderFeed(){
  const v = $('#v-feed');
  const head = [];
  if (S.crewId){
    const by = await crewTotals(startOf('week'));
    const board = Object.entries(by).map(([id,l]) => [id, sum(l).minutes]).sort((a,b) => b[1]-a[1]);
    const i = board.findIndex(([id]) => id === S.uid);
    if (board.length > 1 && i >= 0){
      const mine = board[i][1];
      head.push(i === 0
        ? `<div class="rival"><b>${esc(crew().name)} 이번 주 1위 👑</b><span>2위 ${esc(nameOf(board[1][0]))}보다 ${fmtDur(mine-board[1][1])} 앞서는 중. 방심 금지.</span></div>`
        : `<div class="rival"><b>${esc(nameOf(board[i-1][0]))}까지 ${fmtDur(board[i-1][1]-mine)}!</b><span>${esc(crew().name)} 이번 주 ${i+1}위 / ${board.length}명. 질 수 없다.</span></div>`);
    }
    const pokes = ok(await sb.from('pokes').select('*').eq('crew_id', S.crewId).order('created_at', {ascending:false}).limit(5));
    if (pokes.length) head.push(`<div class="ticker">${pokes.map(p => `<div class="taunt ${p.to_id===S.uid?'mine':''}"><span>${esc(nameOf(p.from_id))} → ${esc(nameOf(p.to_id))}</span><span class="bubble">${esc(p.text)}</span><small>${ago(p.created_at)}</small></div>`).join('')}</div>`);
  }
  const wk = sum(S.mine.filter(w => new Date(w.started_at) >= startOf('week'))).minutes, goal = S.me.weekly_goal_min;
  if (goal) head.push(`<div class="goalbar"><div class="inline" style="justify-content:space-between"><span>이번 주 목표</span><span class="num">${Math.round(wk)} / ${goal}분</span></div><div class="bar"><i style="width:${Math.min(100, wk/goal*100)}%"></i></div></div>`);
  v.innerHTML = head.join('') + (S.feed.length ? S.feed.map(card).join('')
    + (S.feedEnd ? '<p class="hint" style="text-align:center">여기까지예요</p>' : '<button class="ghost full" data-act="more-feed">더 보기</button>')
    : `<div class="empty"><b>${S.crews.length ? '아직 아무도 운동 안 함' : '먼저 크루에 들어가세요'}</b>${S.crews.length ? '지금 기록하면 자동으로 1등이에요.' : '크루를 만들거나 초대코드로 들어가면 친구들 기록이 여기 떠요.'}
      <button class="primary" data-act="go" data-tab="${S.crews.length ? 'log' : 'crew'}">${S.crews.length ? '첫 기록 올리기' : '크루로 가기'}</button></div>`);
}

/* ───────── 공통 클릭 처리 ───────── */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, w = S.feed.find(x => x.id === b.closest('[data-wid]')?.dataset.wid);
  try {
    if (act === 'go') { if (b.dataset.tab === 'log') resetForm(); return show(b.dataset.tab); }
    if (act === 'more-feed') { b.disabled = true; await loadFeed(); return renderFeed(); }
    if (act === 'more-cm') { w._open = true; return renderFeed(); }
    if (act === 'react') {
      const cur = w.reactions.find(r => r.user_id === S.uid);
      if (cur?.kind === b.dataset.k){
        ok(await sb.from('reactions').delete().eq('workout_id', w.id).eq('user_id', S.uid));
        w.reactions = w.reactions.filter(r => r !== cur);
      } else {
        ok(await sb.from('reactions').upsert({workout_id: w.id, user_id: S.uid, kind: b.dataset.k}));
        w.reactions = [...w.reactions.filter(r => r.user_id !== S.uid), {user_id: S.uid, kind: b.dataset.k}];
      }
      return renderFeed();
    }
    if (act === 'del-cm') {
      ok(await sb.from('comments').delete().eq('id', b.dataset.cid));
      w.comments = w.comments.filter(c => c.id !== b.dataset.cid);
      return renderFeed();
    }
    if (act === 'del') {
      if (!confirm('이 기록을 삭제할까요? 사진·댓글도 함께 지워져요.')) return;
      ok(await sb.from('workouts').delete().eq('id', w.id));
      if (w.photos.length) await sb.storage.from('photos').remove(w.photos);
      S.feed = S.feed.filter(x => x !== w); await loadMine();
      toast('삭제했어요'); return renderFeed();
    }
    if (act === 'edit') return editWorkout(w);
    if (act === 'share') return shareWorkout(w);
    if (act === 'poke') {
      b.disabled = true;
      // ponytail: 약올리기 연타 제한 없음. 도배가 생기면 DB 에서 1분 쿨다운 체크 추가
      ok(await sb.from('pokes').insert({to_id: b.dataset.to, crew_id: S.crewId, text: pick(POKES)}));
      return toast(`${nameOf(b.dataset.to)} 약올림 완료 😏`);
    }
    if (act === 'crew') { S.crewId = b.dataset.id; lsSet('crew', S.crewId); return refresh(); }
    if (act === 'copy') {
      const text = `갓생살기 크루 "${crew().name}" 초대코드: ${crew().invite_code}\n${location.origin + location.pathname}`;
      try { await navigator.clipboard.writeText(text); toast('초대 문구를 복사했어요'); } catch { toast('초대코드: ' + crew().invite_code); }
      return;
    }
    if (act === 'leave') {
      if (!confirm(`"${crew().name}" 크루에서 나갈까요?`)) return;
      ok(await sb.from('crew_members').delete().eq('crew_id', S.crewId).eq('user_id', S.uid));
      lsSet('crew', ''); await loadCore(); await loadFeed(true); return refresh();
    }
    if (act === 'del-ch') {
      if (!confirm('이 챌린지를 삭제할까요?')) return;
      ok(await sb.from('challenges').delete().eq('id', b.dataset.id)); return refresh();
    }
    if (act === 'cal') { S.calMonth.setMonth(S.calMonth.getMonth() + +b.dataset.d); return refresh(); }
    if (act === 'retire') {
      const g = S.gear.find(x => x.id === b.dataset.id);
      ok(await sb.from('gear').update({retired: !g.retired}).eq('id', g.id)); g.retired = !g.retired; initGearSelect(); return refresh();
    }
    if (act === 'recap') return shareRecap();
    if (act === 'del-log') {
      if (!confirm('이 측정 기록을 삭제할까요?')) return;
      ok(await sb.from('body_logs').delete().eq('id', b.dataset.id)); await loadBody(); syncForm(); return refresh();
    }
    if (act === 'notif') return openNotifs();
    if (act === 'close-notif') return $('#notif').close();
    if (act === 'logout') { await sb.auth.signOut(); location.reload(); }
  } catch (err) { b.disabled = false; fail(err); }
});

// 공통 폼 제출 처리 (댓글, 크루, 챌린지, 장비, 설정)
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'login-form' || f.id === 'log-form') return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  try {
    if (f.classList.contains('cform')) {
      const body = f.querySelector('input').value.trim(); if (!body) return;
      const w = S.feed.find(x => x.id === f.closest('[data-wid]').dataset.wid);
      const c = ok(await sb.from('comments').insert({workout_id: w.id, body}).select().single());
      w.comments.push(c); w._open = true; return renderFeed();
    }
    const val = id => f.querySelector('#'+id)?.value.trim();
    if (f.id === 'crew-new') {
      const c = ok(await sb.rpc('create_crew', {crew_name: val('cn-name')}));
      S.crewId = c.id; lsSet('crew', c.id); await loadCore(); toast(`"${c.name}" 크루를 만들었어요. 초대코드를 친구에게 보내세요!`); return refresh();
    }
    if (f.id === 'crew-join') {
      const c = ok(await sb.rpc('join_crew', {code: val('cj-code')}));
      S.crewId = c.id; lsSet('crew', c.id); await loadCore(); await loadFeed(true); toast(`"${c.name}" 크루에 들어왔어요!`); return refresh();
    }
    if (f.id === 'ch-new') {
      const row = {crew_id: S.crewId, title: val('ch-title'), metric: val('ch-metric'), target: +val('ch-target'), start_date: val('ch-start'), end_date: val('ch-end'), bet: val('ch-bet') || null};
      if (!row.title || !(row.target > 0) || !row.start_date || !row.end_date || row.end_date < row.start_date) return toast('제목, 목표, 기간을 확인해 주세요.');
      ok(await sb.from('challenges').insert(row)); toast('챌린지 시작! 질 수 없다 🔥'); return refresh();
    }
    if (f.id === 'gear-new') {
      const name = val('gn-name'); if (!name) return toast('장비 이름을 입력해 주세요.');
      ok(await sb.from('gear').insert({name, kind: val('gn-kind'), retire_km: +val('gn-km') || null}));
      S.gear = ok(await sb.from('gear').select('*').eq('user_id', S.uid).order('created_at')); initGearSelect(); return refresh();
    }
    if (f.id === 'settings') {
      const patch = {nickname: val('s-nick') || S.me.nickname, weekly_goal_min: +val('s-goal') || 0};
      S.me = ok(await sb.from('profiles').update(patch).eq('id', S.uid).select().single());
      S.people[S.uid] = S.me; toast('저장했어요'); return refresh();
    }
    if (f.id === 'body-info') {
      const n = id => +val(id) || null;
      ok(await sb.from('body_profile').upsert({user_id: S.uid, birth_year: n('b-year'), sex: val('b-sex') || null, height_cm: n('b-height'), updated_at: new Date().toISOString()}));
      await loadBody(); syncForm(); toast('🔒 기본 정보를 저장했어요'); return refresh();
    }
    if (f.id === 'body-log') {
      const row = {user_id: S.uid, measured_on: val('bl-date')}, n = id => { const x = parseFloat(val(id)); return isFinite(x) ? x : null; };
      for (const k of Object.keys(BODY)) row[k] = n('bl-'+k);
      row.memo = val('bl-memo') || null;
      if (Object.keys(BODY).every(k => row[k] == null)) return toast('측정값을 하나 이상 입력해 주세요.');
      ok(await sb.from('body_logs').upsert(row, {onConflict: 'user_id,measured_on'}));
      await loadBody(); syncForm(); toast('🔒 측정 기록을 저장했어요'); return refresh();
    }
  } catch (err) { fail(err); }
  finally { if (btn) btn.disabled = false; }
});

/* ───────── 기록 폼 ───────── */
const typeVal = () => document.querySelector('input[name=type]:checked').value;
const minutesVal = () => parseDur($('#f-dur').value);
// 수영은 m, 나머지는 km 가 기본 단위
const setUnit = u => { $('#f-unit').value = u; $('#f-dist').placeholder = u === 'm' ? '1500' : '5.00'; };
const toLocalInput = ts => new Date(new Date(ts) - new Date(ts).getTimezoneOffset()*6e4).toISOString().slice(0,16);
let formReady = false;
function initForm(){
  initGearSelect();
  if (formReady) return; formReady = true;
  $('#types').innerHTML = Object.entries(TYPES).map(([k,t], i) => `<label><input type="radio" name="type" id="t-${k}" value="${k}" ${i?'':'checked'}><span>${t.icon} ${t.label}</span></label>`).join('');
  $('#brag-presets').innerHTML = BRAGS.map(s => `<button type="button" class="chip" data-brag="${esc(s)}">${esc(s)}</button>`).join('');
  $('#brag-presets').onclick = e => { const b = e.target.closest('[data-brag]'); if (b) $('#f-brag').value = b.dataset.brag; };
  $('#log-form').addEventListener('input', syncForm);
  $('#types').addEventListener('change', () => setUnit(typeVal() === 'swim' ? 'm' : 'km'));
  $('#f-unit').onchange = () => setUnit($('#f-unit').value);
  $('#f-rpe').oninput = () => $('#rpe-out').textContent = $('#f-rpe').value;
  $('#f-photo').onchange = addPhotos;
  $('#thumbs').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [kind, i] = b.dataset.rm.split(':');
    if (kind === 'k') S.keptPhotos.splice(+i, 1); else URL.revokeObjectURL(S.newPhotos.splice(+i, 1)[0].url);
    drawThumbs();
  };
  $('#f-cancel').onclick = () => { resetForm(); show('feed'); };
  $('#log-form').onsubmit = saveWorkout;
  resetForm();
}
function initGearSelect(){
  $('#f-gear').innerHTML = '<option value="">선택 안 함</option>' + S.gear.filter(g => !g.retired || g.id === S.editing?.gear_id).map(g => `<option value="${g.id}">${g.kind === 'bike' ? '🚴' : g.kind === 'shoes' ? '👟' : '🎒'} ${esc(g.name)}</option>`).join('');
  if (S.editing) $('#f-gear').value = S.editing.gear_id || '';
}
function syncForm(){
  $('#dist-row').hidden = !TYPES[typeVal()].dist;
  const m = minutesVal(), hr = +$('#f-hr').value || null, raw = $('#f-dur').value.trim();
  $('#dur-out').textContent = !raw ? '분:초 또는 시:분:초. "45"만 쓰면 45분' : m ? `= ${fmtDurS(m)}` : '⚠️ 29:44 처럼 입력해 주세요';
  $('#f-kcal').placeholder = m ? `자동: 약 ${estKcal(typeVal(), m, hr)} kcal` : '비우면 자동 계산';
  const w = latest('weight_kg'), a = age(), sex = S.body.p?.sex;
  $('#kcal-basis').textContent = !w ? '🔒 내 몸 탭에 체중을 입력하면 칼로리가 정확해져요 (지금은 70kg 기준)'
    : hr && a && sex ? `심박 공식으로 계산 중 (체중 ${w}kg · ${a}세 · ${sex === 'male' ? '남' : '여'})`
    : `체중 ${w}kg 기준${a && sex ? ' · 평균 심박을 넣으면 심박 공식으로 더 정확해져요' : ' · 내 몸 탭에 나이·성별을 넣고 평균 심박을 입력하면 더 정확해져요'}`;
}
function drawThumbs(){
  $('#thumbs').innerHTML = S.keptPhotos.map((p,i) => `<div><img alt="" src="${esc(S.urls[p] || '')}"><button type="button" data-rm="k:${i}" aria-label="사진 빼기">✕</button></div>`).join('')
    + S.newPhotos.map((p,i) => `<div><img alt="" src="${p.url}"><button type="button" data-rm="n:${i}" aria-label="사진 빼기">✕</button></div>`).join('');
}
async function compress(file){
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600/Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .8));
}
async function addPhotos(e){
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files){
    if (S.keptPhotos.length + S.newPhotos.length >= 10){ toast('사진은 10장까지예요.'); break; }
    try { const blob = await compress(f); S.newPhotos.push({blob, url: URL.createObjectURL(blob)}); }
    catch { toast(`${f.name}은(는) 열 수 없는 사진이에요.`); }
  }
  drawThumbs();
}
function resetForm(){
  S.editing = null;
  $('#log-form').reset();
  S.newPhotos.forEach(p => URL.revokeObjectURL(p.url)); S.newPhotos = []; S.keptPhotos = [];
  $('#f-when').value = toLocalInput(Date.now()); $('#rpe-out').textContent = 5; setUnit('km');
  $('#log-heading').textContent = '운동 기록하기'; $('#f-submit').textContent = '올리고 약올리기'; $('#f-cancel').hidden = true;
  initGearSelect(); drawThumbs(); syncForm();
}
function editWorkout(w){
  resetForm(); S.editing = w;
  $('#t-'+(TYPES[w.type] ? w.type : 'etc')).checked = true;
  $('#f-title').value = w.title || ''; $('#f-when').value = toLocalInput(w.started_at);
  $('#f-dur').value = fmtClock(w.duration_min);
  setUnit(w.type === 'swim' ? 'm' : 'km');
  $('#f-dist').value = +w.distance_km ? (w.type === 'swim' ? Math.round(w.distance_km*1000) : +w.distance_km) : ''; $('#f-elev').value = +w.elev_m || '';
  $('#f-kcal').value = Math.round(w.kcal) || ''; $('#f-hr').value = w.avg_hr || '';
  $('#f-rpe').value = w.rpe || 5; $('#rpe-out').textContent = w.rpe || 5;
  $('#f-brag').value = w.brag || ''; $('#f-memo').value = w.memo || ''; $('#f-note').value = S.notes[w.id] || '';
  $('#vis-'+w.visibility).checked = true; $('#f-commute').checked = w.tags?.includes('commute');
  for (const k of ['pace','hr','kcal']) $('#hide-'+k).checked = w.hide_stats?.includes(k);
  S.keptPhotos = [...w.photos];
  $('#log-heading').textContent = '기록 수정'; $('#f-submit').textContent = '수정 저장'; $('#f-cancel').hidden = false;
  initGearSelect(); drawThumbs(); syncForm(); show('log');
}
async function saveWorkout(e){
  e.preventDefault();
  const minutes = minutesVal();
  if (minutes <= 0){ $('#f-dur').focus(); return toast('운동 시간을 29:44 처럼 입력해 주세요.'); }
  if (minutes > 1440) return toast('운동 시간은 24시간 이하로 입력해 주세요.');
  const type = typeVal(), t = TYPES[type];
  const num = id => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; };
  const distance_km = t.dist ? num('#f-dist') / ($('#f-unit').value === 'm' ? 1000 : 1) : 0;
  if (t.vmax && distance_km / (minutes/60) > t.vmax) return toast(`${t.label} 시속 ${Math.round(distance_km/(minutes/60))}km? 차 타고 잰 거 아니죠? 🚗 거리나 시간을 확인해 주세요.`);
  const row = {
    type, duration_min: minutes, distance_km,
    started_at: new Date($('#f-when').value || Date.now()).toISOString(),
    title: $('#f-title').value.trim() || null,
    elev_m: t.dist ? num('#f-elev') : 0,
    kcal: num('#f-kcal') || estKcal(type, minutes, Math.round(num('#f-hr')) || null),
    avg_hr: Math.round(num('#f-hr')) || null, rpe: +$('#f-rpe').value,
    gear_id: $('#f-gear').value || null,
    brag: $('#f-brag').value.trim() || null, memo: $('#f-memo').value.trim() || null,
    visibility: document.querySelector('input[name=vis]:checked').value,
    tags: $('#f-commute').checked ? ['commute'] : [],
    hide_stats: ['pace','hr','kcal'].filter(k => $('#hide-'+k).checked),
  };
  const note = $('#f-note').value.trim();
  $('#f-submit').disabled = true;
  try {
    const paths = [...S.keptPhotos];
    for (const p of S.newPhotos){
      const path = `${S.uid}/${crypto.randomUUID()}.jpg`;
      ok(await sb.storage.from('photos').upload(path, p.blob, {contentType:'image/jpeg'}));
      paths.push(path);
    }
    row.photos = paths;
    let saved;
    if (S.editing){
      saved = ok(await sb.from('workouts').update(row).eq('id', S.editing.id).select().single());
      const removed = S.editing.photos.filter(p => !paths.includes(p));
      if (removed.length) await sb.storage.from('photos').remove(removed);
    } else saved = ok(await sb.from('workouts').insert(row).select().single());
    if (note) ok(await sb.from('private_notes').upsert({workout_id: saved.id, note}));
    else if (S.notes[saved.id]) ok(await sb.from('private_notes').delete().eq('workout_id', saved.id));
    const wasEdit = !!S.editing;
    resetForm();
    await Promise.all([loadFeed(true), loadMine()]);
    show('feed');
    toast(wasEdit ? '수정했어요' : '올렸다! 이제 다들 약오를 차례 😝');
  } catch (err) { fail(err, '저장하지 못했어요. 다시 시도해 주세요.'); }
  finally { $('#f-submit').disabled = false; }
}

/* ───────── 랭킹 ───────── */
async function renderRank(){
  const v = $('#v-rank');
  if (!S.crewId) return v.innerHTML = `<div class="empty"><b>크루가 없어요</b>크루에 들어가면 순위가 매겨져요.<button class="primary" data-act="go" data-tab="crew">크루로 가기</button></div>`;
  const by = await crewTotals(startOf(S.rPeriod));
  const rows = Object.entries(by).map(([id,l]) => [id, S.rMetric === 'count' ? l.length : l.reduce((a,w) => a + METRIC[S.rMetric].get(w), 0)]).sort((a,b) => b[1]-a[1]);
  const max = Math.max(1, ...rows.map(r => r[1]));
  const seg = (name, cur, opts) => `<div class="seg" data-seg="${name}">${opts.map(([k,l]) => `<button data-v="${k}" aria-pressed="${k===cur}">${l}</button>`).join('')}</div>`;
  v.innerHTML = crewPicker() + `<div class="controls">${seg('rPeriod', S.rPeriod, [['week','이번 주'],['month','이번 달'],['year','올해']])}${seg('rMetric', S.rMetric, Object.entries(METRIC).map(([k,m]) => [k,m.label]))}</div>
    <div class="rank">${rows.map(([id,val], i) => {
      const tag = i === 0 && val > 0 ? '<span class="tag hot">갓생러</span>' : val === 0 ? '<span class="tag">누워있음</span>' : (i === rows.length-1 && rows.length > 2 ? '<span class="tag">꼴찌</span>' : '');
      return `<div class="rk"><span class="pos">${i+1}</span>${avatar(id)}
        <div class="mid"><strong>${esc(nameOf(id))} ${tag}</strong><div class="bar"><i style="width:${val/max*100}%"></i></div></div>
        <span class="val">${METRIC[S.rMetric].fmt(val)}</span>
        ${id !== S.uid ? `<button class="poke" data-act="poke" data-to="${id}">${i === 0 ? '견제하기' : '약올리기'}</button>` : ''}</div>`;
    }).join('')}</div><p class="hint">크루 공개 기록만 집계돼요.</p>`;
  v.querySelectorAll('[data-seg]').forEach(s => s.onclick = e => { const b = e.target.closest('button'); if (b){ S[s.dataset.seg] = b.dataset.v; renderRank(); } });
}
$('#v-me').addEventListener('click', e => {
  const s = e.target.closest('[data-seg]'), b = e.target.closest('button[data-v]');
  if (s && b) { S[s.dataset.seg] = b.dataset.v; refresh(); }
});
function crewPicker(){
  return S.crews.length > 1 ? `<div class="controls">${S.crews.map(c => `<button class="chip" data-act="crew" data-id="${c.id}" aria-pressed="${c.id===S.crewId}">${esc(c.name)}</button>`).join('')}</div>` : '';
}

/* ───────── 크루 + 챌린지 ───────── */
async function renderCrew(){
  const v = $('#v-crew'), c = crew();
  const today = new Date(); const iso = d => toLocalInput(d).slice(0,10);
  const forms = `
    <details ${S.crews.length ? '' : 'open'}><summary>초대코드로 크루 들어가기</summary>
      <form id="crew-join" class="inline"><input type="text" id="cj-code" maxlength="6" placeholder="예: A1B2C3" aria-label="초대코드" style="text-transform:uppercase"><button class="ghost">들어가기</button></form></details>
    <details ${S.crews.length ? '' : 'open'}><summary>새 크루 만들기</summary>
      <form id="crew-new" class="inline"><input type="text" id="cn-name" maxlength="30" placeholder="예: 질수없다 러닝크루" aria-label="크루 이름" required><button class="ghost">만들기</button></form></details>`;
  if (!c) return v.innerHTML = `<h2>크루</h2><p class="hint">크루 안에서만 기록이 공유돼요. 친구에게 초대코드를 받았다면 입력하고, 아니면 새로 만들어서 코드를 보내 주세요.</p>` + forms;

  const chs = ok(await sb.from('challenges').select('*').eq('crew_id', c.id).order('end_date', {ascending:false}).limit(10));
  const blocks = await Promise.all(chs.map(async ch => {
    const from = new Date(ch.start_date+'T00:00'), to = new Date(ch.end_date+'T00:00').getTime() + DAY;
    const by = await crewTotals(from, to, c.id), m = METRIC[ch.metric];
    const rows = Object.entries(by).map(([id,l]) => [id, ch.metric === 'count' ? l.length : l.reduce((a,w) => a + m.get(w), 0)]).sort((a,b) => b[1]-a[1]);
    const live = Date.now() >= from && Date.now() < to, done = Date.now() >= to;
    return `<div class="ch"><header><div><b>${esc(ch.title)}</b><div class="hint">${ch.start_date} ~ ${ch.end_date} · 목표 ${m.fmt(ch.target)}${ch.bet ? ` · 🎲 ${esc(ch.bet)}` : ''}</div></div>
      <span class="state ${live?'live':''}">${live ? '진행 중' : done ? '종료' : '예정'}</span></header>
      ${rows.map(([id,val]) => `<div class="prow">${avatar(id,'sm')}<div><div>${esc(nameOf(id))}${val >= ch.target ? ' 🏅' : ''}</div><div class="bar"><i style="width:${Math.min(100, val/ch.target*100)}%"></i></div></div><span class="val">${m.fmt(val)}</span></div>`).join('')}
      ${done && rows[0]?.[1] > 0 ? `<p class="hint">🏆 우승 ${esc(nameOf(rows[0][0]))}${ch.bet ? ` — 꼴찌 ${esc(nameOf(rows.at(-1)[0]))}가 ${esc(ch.bet)}` : ''}</p>` : ''}
      ${ch.created_by === S.uid ? `<button class="linkbtn danger" data-act="del-ch" data-id="${ch.id}">챌린지 삭제</button>` : ''}</div>`;
  }));

  v.innerHTML = crewPicker() + `
    <div class="card">
      <div class="inline" style="justify-content:space-between"><h2 style="margin:0">${esc(c.name)}</h2><span class="hint">${S.members[c.id].length}명</span></div>
      <div><span class="hint">초대코드</span><div class="inline"><span class="code">${esc(c.invite_code)}</span><button class="ghost" data-act="copy">초대 문구 복사</button></div></div>
      <div class="members">${S.members[c.id].map(id => `<span>${avatar(id,'sm')}${esc(nameOf(id))}</span>`).join('')}</div>
    </div>
    <h2>챌린지</h2>
    ${blocks.join('') || '<p class="hint">아직 챌린지가 없어요. 내기 하나 걸어 보세요.</p>'}
    <details><summary>새 챌린지 만들기</summary>
      <form id="ch-new" class="stack">
        <label><span>제목</span><input type="text" id="ch-title" maxlength="40" placeholder="예: 10월 100km 달성"></label>
        <div class="row">
          <label><span>기준</span><select id="ch-metric">${Object.entries(METRIC).map(([k,m]) => `<option value="${k}">${m.label}${k==='minutes'?' (분)':k==='distance'?' (km)':k==='kcal'?' (kcal)':' (회)'}</option>`).join('')}</select></label>
          <label><span>목표</span><input type="number" id="ch-target" min="1" inputmode="decimal" placeholder="100"></label>
        </div>
        <div class="row">
          <label><span>시작</span><input type="date" id="ch-start" value="${iso(today)}"></label>
          <label><span>끝</span><input type="date" id="ch-end" value="${iso(new Date(+today + 6*DAY))}"></label>
        </div>
        <label><span>내기 (선택)</span><input type="text" id="ch-bet" maxlength="60" placeholder="꼴찌가 커피 쏘기"></label>
        <button class="primary">챌린지 시작</button>
      </form></details>
    ${forms}
    <button class="linkbtn danger" data-act="leave">이 크루에서 나가기</button>`;
}

/* ───────── 나 (통계·캘린더·배지·장비·설정) ───────── */
function streaks(list){
  const days = new Set(list.map(w => dayKey(w.started_at)));
  const d = new Date(); if (!days.has(dayKey(d))) d.setDate(d.getDate()-1);
  let daily = 0; while (days.has(dayKey(d))){ daily++; d.setDate(d.getDate()-1); }
  // 스트라바식 주간 스트릭: 월~일 사이 1회 이상 운동한 주가 연속된 수
  const weeks = new Set(list.map(w => startOf('week', new Date(w.started_at))));
  let wk = startOf('week'); if (!weeks.has(wk)) wk -= 7*DAY;
  let weekly = 0; while (weeks.has(wk)){ weekly++; wk = startOf('week', new Date(wk - 3*DAY)); }
  let best = 0, run = 0, prev = null;
  for (const k of [...new Set(list.map(w => startOf('day', new Date(w.started_at))))].sort((a,b) => a-b)){
    run = prev !== null && Math.round((k - prev)/DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k;
  }
  return {daily, weekly, best};
}
function badges(list, st){
  const all = sum(list), runs = list.filter(w => w.type === 'run'), hours = list.map(w => new Date(w.started_at).getHours());
  const maxRun = Math.max(0, ...runs.map(w => +w.distance_km));
  return [
    ['👣','첫 걸음', list.length >= 1], ['🔟','10회 출석', list.length >= 10], ['💯','100회 출석', list.length >= 100],
    ['🏃','5K 클럽', maxRun >= 5], ['⚡','10K 전사', maxRun >= 10], ['🥈','하프 마라토너', maxRun >= 21.0975], ['🥇','풀 마라토너', maxRun >= 42.195],
    ['🌅','아침형 인간', hours.some(h => h >= 4 && h < 7)], ['🦉','올빼미', hours.some(h => h >= 22 || h < 2)],
    ['🔥','7일 연속', st.best >= 7], ['📅','4주 연속', st.weekly >= 4], ['🗺️','누적 100km', all.distance >= 100],
    ['⏱️','누적 50시간', all.minutes >= 3000], ['⛰️','누적 상승 1000m', all.elev >= 1000], ['🎨','팔방미인 5종목', new Set(list.map(w => w.type)).size >= 5],
  ];
}
const meTabs = () => `<div class="seg" data-seg="meTab"><button data-v="stats" aria-pressed="${S.meTab==='stats'}">운동 기록</button><button data-v="body" aria-pressed="${S.meTab==='body'}">🔒 내 몸</button></div>`;
async function renderMe(){
  if (S.meTab === 'body') return renderBody();
  const v = $('#v-me'), me = S.me, mine = S.mine;
  S.calMonth ??= new Date(startOf('month'));
  const wk = startOf('week'), in_ = (a,b) => mine.filter(w => { const t = +new Date(w.started_at); return t >= a && t < b; });
  const tw = sum(in_(wk, Infinity)), lw = sum(in_(wk - 7*DAY, wk)), mo = startOf('month'), tm = sum(in_(mo, Infinity));
  const diff = (a,b,f) => { const d = a-b; return d ? `<em class="${d>0?'up':'down'}">${d>0?'▲':'▼'} ${f(Math.abs(d))} 지난주 대비</em>` : '<em>지난주와 같음</em>'; };
  const st = streaks(mine);

  // 12주 그래프
  const weeks = Array.from({length:12}, (_,i) => { const s = wk - (11-i)*7*DAY; return {s, v: sum(in_(s, s + 7*DAY)).minutes}; });
  const wmax = Math.max(1, ...weeks.map(w => w.v));
  // 캘린더
  const cm = S.calMonth, first = new Date(cm), lead = (first.getDay()+6)%7, dim = new Date(cm.getFullYear(), cm.getMonth()+1, 0).getDate();
  const byDay = {}; for (const w of mine) (byDay[dayKey(w.started_at)] ??= []).push(w);
  const cells = Array.from({length: lead}, () => '<div></div>').join('') + Array.from({length: dim}, (_,i) => {
    const d = new Date(cm.getFullYear(), cm.getMonth(), i+1), ws = byDay[dayKey(d)] || [];
    const tip = ws.map(w => `${TYPES[w.type]?.label} ${fmtDur(w.duration_min)}`).join(', ');
    return `<div class="d ${ws.length?'on':''} ${dayKey(d)===dayKey(Date.now())?'today':''}" ${tip ? `title="${esc(tip)}"` : ''}><span>${i+1}</span><i>${ws.slice(0,2).map(w => TYPES[w.type]?.icon || '✨').join('')}</i></div>`;
  }).join('');
  // 종목별, 최고기록
  const byType = {}; for (const w of mine) byType[w.type] = (byType[w.type]||0) + +w.duration_min;
  const types = Object.entries(byType).sort((a,b) => b[1]-a[1]), tmax = types[0]?.[1] || 1;
  const best = f => mine.length ? mine.reduce((a,w) => f(w) > f(a) ? w : a) : null;
  const pbRun = k => { const r = mine.filter(w => w.type === 'run' && +w.distance_km >= k); if (!r.length) return null;
    const b = r.reduce((a,w) => w.duration_min/w.distance_km < a.duration_min/a.distance_km ? w : a); return pace(b)[1]; };
  // 장비 누적 거리
  const gearKm = id => mine.filter(w => w.gear_id === id).reduce((a,w) => a + +w.distance_km, 0);
  const goal = me.weekly_goal_min;
  const monthTop = Object.entries(in_(mo, Infinity).reduce((a,w) => (a[w.type] = (a[w.type]||0) + 1, a), {})).sort((a,b) => b[1]-a[1])[0];

  v.innerHTML = `
    <div class="profile">${avatar(S.uid,'lg')}<div><b>${esc(me.nickname)}</b><div class="hint">${mine.length}번 운동 · 크루 ${S.crews.length}개</div></div></div>
    ${meTabs()}
    ${goal ? `<div class="goalbar"><div class="inline" style="justify-content:space-between"><span>이번 주 목표</span><span class="num">${Math.round(tw.minutes)} / ${goal}분</span></div><div class="bar"><i style="width:${Math.min(100, tw.minutes/goal*100)}%"></i></div></div>` : ''}
    <div class="tiles">
      <div class="tile"><small>이번 주 운동시간</small><b>${fmtDur(tw.minutes)}</b>${diff(tw.minutes, lw.minutes, fmtDur)}</div>
      <div class="tile"><small>이번 주 칼로리</small><b>${fmtNum(tw.kcal)}</b>${diff(tw.kcal, lw.kcal, x => fmtNum(x)+' kcal')}</div>
      <div class="tile"><small>주간 스트릭</small><b>${st.weekly}주</b><em>매주 1회 이상 운동</em></div>
      <div class="tile"><small>연속 운동</small><b>${st.daily}일</b><em>최장 ${st.best}일</em></div>
    </div>
    <div class="recap"><span class="hint" style="color:inherit;opacity:.7">${new Date().getMonth()+1}월 결산</span>
      <b>${tm.count}번, ${fmtDur(tm.minutes)}, ${fmtNum(tm.kcal)} kcal 태움</b>
      <span>${tm.distance ? `${fmtNum(tm.distance,1)} km 이동 · ` : ''}${monthTop ? `제일 많이 한 운동: ${TYPES[monthTop[0]]?.label} ${monthTop[1]}회` : '이번 달은 아직 기록이 없어요'}</span>
      <button class="ghost" data-act="recap">📸 결산 카드 만들기</button></div>
    <h2>최근 12주 운동시간</h2>
    <div><div class="chart">${weeks.map(w => `<div><span>${w.v ? Math.round(w.v) : ''}</span><i style="height:${w.v/wmax*100}%"></i></div>`).join('')}</div>
      <div class="axis">${weeks.map((w,i) => `<span>${i%3===2 || i===11 ? (new Date(w.s).getMonth()+1)+'/'+new Date(w.s).getDate() : ''}</span>`).join('')}</div>
      <p class="hint">막대 위 숫자는 분, 아래는 그 주 월요일 날짜.</p></div>
    <div class="calhead"><h2>${cm.getFullYear()}년 ${cm.getMonth()+1}월</h2><div class="inline"><button class="ghost" data-act="cal" data-d="-1" aria-label="이전 달">‹</button><button class="ghost" data-act="cal" data-d="1" aria-label="다음 달">›</button></div></div>
    <div class="cal">${['월','화','수','목','금','토','일'].map(d => `<div class="h">${d}</div>`).join('')}${cells}</div>
    ${types.length ? `<h2>종목별 비중</h2><div class="typebars">${types.map(([k,val]) => `<div class="tb"><span>${TYPES[k]?.icon||''} ${esc(TYPES[k]?.label||k)}</span><div class="bar"><i style="width:${val/tmax*100}%"></i></div><span class="val">${fmtDur(val)}</span></div>`).join('')}</div>` : ''}
    ${mine.length ? `<h2>개인 최고 기록</h2><div class="pbs">
      ${[['5K 최고 페이스', pbRun(5)], ['10K 최고 페이스', pbRun(10)], ['하프 최고 페이스', pbRun(21.0975)]].filter(x => x[1]).map(([k,val]) => `<div class="pb"><span>${k}</span><b>${val}</b></div>`).join('')}
      ${(b => +b.distance_km ? `<div class="pb"><span>최장 거리 · ${esc(TYPES[b.type]?.label)}</span><b>${fmtNum(b.distance_km,2)} km</b></div>` : '')(best(w => +w.distance_km))}
      ${(b => `<div class="pb"><span>최장 시간 · ${esc(TYPES[b.type]?.label)}</span><b>${fmtDur(b.duration_min)}</b></div>`)(best(w => +w.duration_min))}
      ${(b => `<div class="pb"><span>최대 칼로리 · ${esc(TYPES[b.type]?.label)}</span><b>${fmtNum(b.kcal)} kcal</b></div>`)(best(w => +w.kcal))}
      ${(b => b.avg_hr ? `<div class="pb"><span>최고 상대적 노력</span><b>${effort(b)}</b></div>` : '')(best(effort))}
    </div>` : ''}
    <h2>배지</h2>
    <div class="badges">${badges(mine, st).map(([i,l,on]) => `<div class="badge ${on?'':'off'}"><i>${i}</i>${l}</div>`).join('')}</div>
    <h2>내 장비</h2>
    ${S.gear.map(g => { const km = gearKm(g.id); return `<div class="gear"><span>${g.kind === 'bike' ? '🚴' : g.kind === 'shoes' ? '👟' : '🎒'} <b>${esc(g.name)}</b>${g.retired ? ' <span class="tag">은퇴</span>' : ''}</span>
      <span class="num">${fmtNum(km,1)}${g.retire_km ? ' / '+fmtNum(g.retire_km)+' km' : ' km'}</span>
      ${g.retire_km ? `<div class="bar" style="height:6px;background:var(--sunk);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, km/g.retire_km*100)}%;background:${km >= g.retire_km ? 'var(--bad)' : 'var(--accent)'}"></i></div>` : ''}
      ${g.retire_km && km >= g.retire_km && !g.retired ? '<span class="hint danger" style="grid-column:1/3">교체할 때가 됐어요!</span>' : ''}
      <button class="linkbtn" data-act="retire" data-id="${g.id}">${g.retired ? '다시 사용' : '은퇴시키기'}</button></div>`; }).join('') || '<p class="hint">신발이나 자전거를 등록하면 누적 거리가 쌓여요.</p>'}
    <details><summary>장비 추가</summary>
      <form id="gear-new" class="stack"><div class="row">
        <label><span>이름</span><input type="text" id="gn-name" maxlength="40" placeholder="예: 페가수스 41"></label>
        <label><span>종류</span><select id="gn-kind"><option value="shoes">신발</option><option value="bike">자전거</option><option value="etc">기타</option></select></label>
        <label><span>교체 알림 (km)</span><input type="number" id="gn-km" min="1" inputmode="numeric" placeholder="예: 700"></label>
      </div><button class="ghost">추가</button></form></details>
    <details><summary>설정</summary>
      <form id="settings" class="stack"><div class="row">
        <label><span>닉네임</span><input type="text" id="s-nick" maxlength="20" value="${esc(me.nickname)}"></label>
        <label><span>주간 목표 (분)</span><input type="number" id="s-goal" min="0" max="5000" value="${me.weekly_goal_min}"></label>
      </div><button class="ghost">저장</button></form>
      <p class="hint" style="margin-top:12px">닉네임과 주간 목표는 크루원에게 보여요. 키·체중 같은 신체 정보는 🔒 내 몸 탭에 따로 저장돼요.</p>
      <button class="ghost full danger" data-act="logout" style="margin-top:12px">로그아웃</button></details>`;
}

// 내 몸 탭: 본인 전용 (body_profile / body_logs 는 RLS 로 본인만 접근)
function lineChart(pts, unit, d){
  if (pts.length < 2) return '<p class="hint">측정 기록이 2개 이상 쌓이면 추이 그래프가 그려져요.</p>';
  const W = 600, H = 190, L = 44, R = 12, T = 14, B = 26;
  const t0 = pts[0].t, t1 = pts.at(-1).t || t0 + 1, vs = pts.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * .15 || 1; lo -= pad; hi += pad;
  const x = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ticks = [hi - pad, (hi + lo)/2, lo + pad];
  const lbl = t => { const dt = new Date(t); return `${dt.getMonth()+1}/${dt.getDate()}`; };
  return `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} 추이 그래프">
    ${ticks.map(v => `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fmtNum(v, d)}</text>`).join('')}
    <polygon points="${L},${H-B} ${line} ${x(pts.at(-1).t)},${H-B}" class="area"/>
    <polyline points="${line}" class="ln"/>
    ${pts.map((p,i) => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${i === pts.length-1 ? 5 : 3}" class="pt"/>`).join('')}
    <text x="${L}" y="${H-6}">${lbl(t0)}</text><text x="${W-R}" y="${H-6}" text-anchor="end">${lbl(pts.at(-1).t)}</text>
  </svg>`;
}
async function renderBody(){
  const v = $('#v-me'), p = S.body.p || {}, logs = S.body.logs, a = age(), h = p.height_cm, w = latest('weight_kg'), fat = latest('body_fat_pct');
  const bmi = w && h ? w / (h/100)**2 : null;
  // 대한비만학회 기준
  const bmiCat = !bmi ? '' : bmi < 18.5 ? '저체중' : bmi < 23 ? '정상' : bmi < 25 ? '비만 전단계' : bmi < 30 ? '1단계 비만' : bmi < 35 ? '2단계 비만' : '3단계 비만';
  const base = bmr(), today = sum(S.mine.filter(x => dayKey(x.started_at) === dayKey(Date.now()))).kcal;
  const m = BODY[S.bodyMetric], pts = logs.filter(l => l[S.bodyMetric] != null).map(l => ({t: +new Date(l.measured_on+'T00:00'), v: +l[S.bodyMetric]}));
  const delta = (k, days) => { const s = logs.filter(l => l[k] != null); if (s.length < 2) return '';
    const last = s.at(-1), from = days ? s.find(l => +new Date(l.measured_on) >= +new Date(last.measured_on) - days*DAY) : s[0];
    const dd = last[k] - from[k]; return dd ? `<em class="${(k === 'muscle_kg') === (dd > 0) ? 'up' : 'down'}">${dd > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(dd), BODY[k].d)}${BODY[k].unit} ${days ? days+'일' : '처음'} 대비</em>` : '<em>변화 없음</em>'; };
  const last = logs.at(-1), todayIso = toLocalInput(Date.now()).slice(0,10), editing = logs.find(l => l.measured_on === todayIso) || {};
  const tile = (k, label, val, sub='') => `<div class="tile"><small>${label}</small><b>${val ?? '–'}</b>${sub}</div>`;

  v.innerHTML = `
    <div class="profile">${avatar(S.uid,'lg')}<div><b>${esc(S.me.nickname)}</b><div class="hint">신체 기록 ${logs.length}건</div></div></div>
    ${meTabs()}
    <div class="private"><b>🔒 개인용 기록이에요</b>이 탭의 나이·키·체중·체지방·근육량은 <b>나만</b> 볼 수 있어요. 크루원을 포함한 다른 사람에게는 보이지 않고, 랭킹이나 피드에도 나오지 않아요. 운동 칼로리를 내 몸에 맞게 계산하는 데만 쓰여요.</div>
    <div class="tiles">
      ${tile('w', '체중', w != null ? fmtNum(w,1)+' kg' : null, delta('weight_kg', 30))}
      ${tile('f', '체지방률', fat != null ? fmtNum(fat,1)+' %' : null, delta('body_fat_pct', 30))}
      ${tile('m', '골격근량', latest('muscle_kg') != null ? fmtNum(latest('muscle_kg'),1)+' kg' : null, delta('muscle_kg', 30))}
      ${tile('b', 'BMI', bmi ? fmtNum(bmi,1) : null, bmiCat ? `<em>${bmiCat}</em>` : '<em>키·체중 입력 필요</em>')}
      ${tile('r', '기초대사량', base ? fmtNum(base)+' kcal' : null, base ? '<em>하루 가만히 있어도 쓰는 열량</em>' : '<em>나이·성별·키·체중 필요</em>')}
      ${tile('t', '오늘 총 소모 추정', base ? fmtNum(Math.round(base*1.2 + today))+' kcal' : null, base ? `<em>일상 ${fmtNum(Math.round(base*1.2))} + 운동 ${fmtNum(today)}</em>` : '<em>기초대사량 필요</em>')}
      ${fat != null && w ? tile('l', '체지방량 / 제지방량', `${fmtNum(w*fat/100,1)} / ${fmtNum(w*(1-fat/100),1)}`, '<em>kg</em>') : ''}
    </div>
    <h2>추이</h2>
    <div class="seg" data-seg="bodyMetric">${Object.entries(BODY).map(([k,b]) => `<button data-v="${k}" aria-pressed="${k===S.bodyMetric}">${b.label}</button>`).join('')}</div>
    ${lineChart(pts, m.unit, m.d)}
    <details ${logs.length ? '' : 'open'}><summary>오늘 측정값 기록하기</summary>
      <form id="body-log" class="stack">
        <div class="row">
          <label><span>측정일</span><input type="date" id="bl-date" value="${todayIso}" max="${todayIso}"></label>
          ${Object.entries(BODY).map(([k,b]) => `<label><span>${b.label} (${b.unit})</span><input type="number" id="bl-${k}" step="0.1" inputmode="decimal" value="${editing[k] ?? ''}" placeholder="${last?.[k] ?? ''}"></label>`).join('')}
        </div>
        <label><span>메모</span><input type="text" id="bl-memo" maxlength="200" value="${esc(editing.memo || '')}" placeholder="예: 아침 공복, 인바디"></label>
        <p class="hint">같은 날짜로 다시 저장하면 그날 기록을 덮어써요. 빈 칸은 저장하지 않아요.</p>
        <button class="primary">🔒 나만 보게 저장</button>
      </form></details>
    <details ${p.birth_year && p.sex && p.height_cm ? '' : 'open'}><summary>기본 정보 (나이·성별·키)</summary>
      <form id="body-info" class="stack"><div class="row">
        <label><span>출생연도</span><input type="number" id="b-year" min="1900" max="${new Date().getFullYear()}" value="${p.birth_year ?? ''}" placeholder="예: 1995"></label>
        <label><span>성별 (칼로리 공식용)</span><select id="b-sex"><option value="">선택</option><option value="male" ${p.sex==='male'?'selected':''}>남</option><option value="female" ${p.sex==='female'?'selected':''}>여</option></select></label>
        <label><span>키 (cm)</span><input type="number" id="b-height" min="80" max="250" step="0.1" value="${p.height_cm ?? ''}"></label>
      </div>${a ? `<p class="hint">만 나이 기준이 아닌 연 나이 ${a}세로 계산해요.</p>` : ''}<button class="ghost">저장</button></form></details>
    ${logs.length ? `<h2>측정 기록</h2><div class="pbs">${[...logs].reverse().map(l => `<div class="pb"><span>${l.measured_on.slice(5).replace('-', '/')}${l.memo ? ` · <span class="hint">${esc(l.memo)}</span>` : ''}</span>
      <span class="inline"><b>${Object.entries(BODY).filter(([k]) => l[k] != null).map(([k,b]) => `${fmtNum(l[k], b.d)}${b.unit}`).join(' · ')}</b><button class="linkbtn" data-act="del-log" data-id="${l.id}" aria-label="삭제">✕</button></span></div>`).join('')}</div>` : ''}
    <p class="hint">칼로리 계산: 평균 심박을 입력한 운동은 심박·나이·성별·체중으로(Keytel 공식), 아니면 운동 강도(MET)×체중×시간으로 계산해요. 기초대사량은 Mifflin-St Jeor 공식이에요.</p>`;
}

/* ───────── 알림 (약올림·댓글·반응) ───────── */
// ponytail: 앱을 열었을 때만 확인. 휴대폰 푸시 알림은 서버 함수(Edge Function)+VAPID 키가 필요해 2단계에서
async function fetchNotifs(){
  const since = new Date(Date.now() - 14*DAY).toISOString();
  const [pk, cm, rx] = await Promise.all([
    sb.from('pokes').select('from_id,text,created_at').eq('to_id', S.uid).gte('created_at', since).order('created_at', {ascending:false}).limit(30).then(ok),
    sb.from('comments').select('user_id,body,created_at,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
    sb.from('reactions').select('user_id,kind,created_at,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
  ]);
  const what = w => w.title || TYPES[w.type]?.label || '운동';
  return [
    ...pk.map(p => ({ts: p.created_at, id: p.from_id, html: `<b>${esc(nameOf(p.from_id))}</b>님이 약올림: <span class="bubble">${esc(p.text)}</span>`})),
    ...cm.map(c => ({ts: c.created_at, id: c.user_id, html: `<b>${esc(nameOf(c.user_id))}</b>님이 "${esc(what(c.workouts))}"에 댓글: ${esc(c.body)}`})),
    ...rx.map(r => ({ts: r.created_at, id: r.user_id, html: `<b>${esc(nameOf(r.user_id))}</b>님이 "${esc(what(r.workouts))}"에 ${REACTS[r.kind]}`})),
  ].sort((a,b) => new Date(b.ts) - new Date(a.ts));
}
async function loadNotifs(){
  try { const list = await fetchNotifs(); $('#notif-dot').hidden = !list.some(n => new Date(n.ts) > new Date(lsGet('seen') || 0)); }
  catch (err) { console.error(err); }
}
async function openNotifs(){
  $('#notif-list').innerHTML = '<p class="hint">불러오는 중…</p>';
  $('#notif').showModal();
  const list = await fetchNotifs();
  lsSet('seen', new Date().toISOString()); $('#notif-dot').hidden = true;
  $('#notif-list').innerHTML = list.map(n => `<div class="nt">${avatar(n.id,'sm')}<div>${n.html}<small>${ago(n.ts)}</small></div></div>`).join('') || '<p class="hint">최근 2주간 알림이 없어요. 먼저 약올려 보세요.</p>';
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.uid && S.me) loadNotifs(); });

/* ───────── 공유 카드 (인스타 4:5) ───────── */
async function makeCard({kicker, title, stats, brag, photo}){
  await document.fonts.load('64px "Black Han Sans"').catch(() => {});
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#2B37F0'; g.fillRect(0, 0, W, H);
  if (photo){
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = photo;
    try {
      await img.decode();
      const s = Math.max(W/img.width, H/img.height);
      g.drawImage(img, (W - img.width*s)/2, (H - img.height*s)/2, img.width*s, img.height*s);
      const grd = g.createLinearGradient(0, H*0.35, 0, H); grd.addColorStop(0, 'rgba(12,14,27,0)'); grd.addColorStop(1, 'rgba(12,14,27,.92)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    } catch {}
  }
  const D = '"Black Han Sans","Malgun Gothic",sans-serif', B = '"IBM Plex Sans KR","Malgun Gothic",sans-serif';
  // 상단 스티커
  g.save(); g.translate(64, 96); g.rotate(-0.05);
  g.fillStyle = '#12152B'; g.fillRect(8, 8, 360, 76); g.fillStyle = '#FFD43B'; g.fillRect(0, 0, 360, 76);
  g.fillStyle = '#2A2200'; g.font = `44px ${D}`; g.fillText('질 수 없다!', 24, 56); g.restore();
  g.fillStyle = '#fff'; g.font = `500 30px ${B}`; g.fillText('갓생살기 프로젝트', 66, 240);
  // 하단 내용
  let y = H - 80;
  const cols = stats.slice(0, 3), cw = (W - 128)/3;
  cols.forEach(([k, val], i) => { g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `500 28px ${B}`; g.fillText(k, 64 + i*cw, y - 64); g.fillStyle = '#fff'; g.font = `600 48px ${B}`; g.fillText(val, 64 + i*cw, y); });
  y -= 150;
  g.fillStyle = '#fff'; g.font = `84px ${D}`;
  const lines = wrap(g, title, W - 128).slice(0, 2).reverse();
  for (const l of lines){ g.fillText(l, 64, y); y -= 96; }
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `500 32px ${B}`; g.fillText(kicker, 64, y + 20);
  if (brag){
    g.font = `700 38px ${B}`; const bw = Math.min(W - 128, g.measureText(brag).width + 48);
    g.fillStyle = '#FFD43B'; g.fillRect(64, y - 110, bw, 72); g.fillStyle = '#2A2200'; g.fillText(brag, 88, y - 60, bw - 48);
  }
  try { return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(), 'image/jpeg', .9)); }
  catch { return photo ? makeCard({kicker, title, stats, brag}) : null; } // 사진 CORS 실패 시 사진 없이
}
function wrap(g, text, max){
  const out = []; let line = '';
  for (const ch of String(text)){ if (g.measureText(line + ch).width > max){ out.push(line); line = ch; } else line += ch; }
  return [...out, line];
}
async function shareBlob(blob){
  if (!blob) return toast('카드를 만들지 못했어요.');
  const file = new File([blob], 'godsaeng.jpg', {type: 'image/jpeg'});
  if (navigator.canShare?.({files: [file]})) { try { await navigator.share({files: [file], text: '질 수 없다! #갓생살기'}); } catch {} return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'godsaeng.jpg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('카드 이미지를 저장했어요');
}
async function shareWorkout(w){
  toast('카드 만드는 중…');
  const t = TYPES[w.type] || TYPES.etc, pc = pace(w);
  const stats = [+w.distance_km ? ['거리', fmtDist(w)] : null, ['시간', fmtClock(w.duration_min)], pc || ['칼로리', fmtNum(w.kcal)+' kcal']].filter(Boolean);
  shareBlob(await makeCard({kicker: `${t.icon} ${t.label} · ${fmtDate(w.started_at)}`, title: w.title || `${t.label} 완료`, stats, brag: w.brag, photo: S.urls[w.photos[0]]}));
}
async function shareRecap(){
  toast('카드 만드는 중…');
  const tm = sum(S.mine.filter(w => new Date(w.started_at) >= startOf('month')));
  const withPhoto = S.mine.find(w => new Date(w.started_at) >= startOf('month') && w.photos?.length);
  if (withPhoto) await signPhotos([withPhoto.photos[0]]);
  shareBlob(await makeCard({kicker: `${S.me.nickname}의 ${new Date().getMonth()+1}월 결산`, title: `${tm.count}번 운동 완료`,
    stats: [['시간', fmtDur(tm.minutes)], ['칼로리', fmtNum(tm.kcal)], ['거리', fmtNum(tm.distance,1)+' km']], brag: '이번 달도 내가 이김 😝', photo: withPhoto && S.urls[withPhoto.photos[0]]}));
}

/* ───────── 설치(PWA) ───────── */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

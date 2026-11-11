// 알림함: 받은 팔로우·약올림·댓글·반응 (최근 2주). 누르면 그 기록이나 그 사람 프로필로
// ponytail: 앱을 열었을 때만 확인. 휴대폰 푸시 알림은 서버 함수(Edge Function)+VAPID 키가 필요해 다음 단계에서
import { S, sb, ok, $ } from '../state.js';
import { DAY, esc, ago, lsGet, lsSet, pop } from '../lib/util.js';
import { kkRx, kkTease, cmText, kkEmpty } from '../lib/icons.js';
import { REACTS, typeOf } from '../lib/types.js';
import { nameOf, avatar } from '../lib/calc.js';
import { NOTICES } from '../lib/notices.js';
import { loadFollows } from '../lib/data.js';
import { goToWorkout, markRxSeen } from './feed.js';
import { openProfile } from './profile.js';

async function fetchNotifs() {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const [, pk, cm, rx, tg, cl] = await Promise.all([
    loadFollows(),
    sb.from('pokes').select('from_id,text,created_at').eq('to_id', S.uid).gte('created_at', since).order('created_at', { ascending: false }).limit(30).then(ok),
    sb.from('comments').select('user_id,body,created_at,workout_id,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
    sb.from('reactions').select('user_id,kind,created_at,workout_id,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
    sb.rpc('together_asks').then(r => r.data || []),
    sb.from('comment_likes').select('user_id,created_at,comments!inner(user_id,body,workout_id)').eq('comments.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(r => r.data || []),   // SQL 018 전이면 빈 목록   // 함께했나요?(SQL 017 실행 전이면 빈 목록)
  ]);
  const what = w => esc(w.title || typeOf(w.type).label);
  return [
    ...Object.entries(S.followedAt || {}).filter(([, t]) => new Date(t) >= new Date(since)).map(([id, t]) => ({ ts: t, id,
      html: `<b>${esc(nameOf(id))}</b>님이 ${S.following.includes(id) ? '맞팔로우해서 친구가 됐어요' : '팔로우했어요. 눌러서 맞팔로우하면 친구가 돼요'}` })),
    ...pk.map(p => ({ ts: p.created_at, id: p.from_id, pop: kkTease(), cap: `${nameOf(p.from_id)}님이 약올렸어요`, html: `<b>${esc(nameOf(p.from_id))}</b>님이 약올림 <mark>${esc(p.text)}</mark>` })),
    ...cm.map(c => ({ ts: c.created_at, id: c.user_id, wid: c.workout_id, html: `<b>${esc(nameOf(c.user_id))}</b>님이 "${what(c.workouts)}"에 댓글: ${esc(cmText(c.body))}` })),
    ...rx.map(r => ({ ts: r.created_at, id: r.user_id, wid: r.workout_id, rk: `${r.user_id}:${r.kind}`, pop: kkRx(r.kind), cap: `${nameOf(r.user_id)}님이 '${REACTS[r.kind]?.[1] || ''}'`, html: `<b>${esc(nameOf(r.user_id))}</b>님이 "${what(r.workouts)}"에 '${REACTS[r.kind]?.[1] || ''}'` })),
    ...cl.map(l => ({ ts: l.created_at, id: l.user_id, wid: l.comments.workout_id, html: `<b>${esc(nameOf(l.user_id))}</b>님이 내 댓글에 하트: ${esc(cmText(l.comments.body))}` })),
    ...tg.map(t => ({ ts: t.created_at, id: t.other, tg: t.id,
      html: `<b>${esc(nameOf(t.other))}</b>님${t.manual ? '이' : '과'} "${what(t)}" 운동을 ${t.manual ? '함께 했다고 해요' : '함께했나요?'}` })),
  ].filter(n => !S.blocked.includes(n.id)).sort((a, b) => new Date(b.ts) - new Date(a.ts));
}
const newNotice = () => NOTICES.length > 0 && NOTICES[0].id !== lsGet('notice');
export async function loadNotifs() {
  $('#notif-dot').hidden = !newNotice();
  try {
    const list = await fetchNotifs(); if (list.some(n => new Date(n.ts) > new Date(lsGet('seen') || 0))) $('#notif-dot').hidden = false;
    // 받은 반응·약올림이 수십 개 쌓여도 가장 최근 하나만 깐족이로 '뿅'(본 건 다시 안 띄움). 반응은 그 글이 화면에 보이면 그 위에
    const p = list.find(n => n.pop);
    if (p && new Date(p.ts) > new Date(lsGet('popSeen') || 0)) {
      lsSet('popSeen', p.ts); if (p.rk) markRxSeen(p.wid, [p.rk]);   // 앱 열 때 띄운 반응은 내 글 스크롤 때 다시 안 띄움
      setTimeout(() => { const c = p.wid && document.querySelector(`#v-feed [data-wid="${p.wid}"]`); pop(p.pop, c?.querySelector('.photos') || c, p.cap); }, 700);
    }
  }
  catch (err) { console.error(err); }
}
// 공지: 최근 3개, 안 읽은 맨 위 공지는 펼쳐서
const noticesHtml = () => NOTICES.length ? `<section class="notices"><h3>공지</h3>${NOTICES.slice(0, 3).map((n, i) => `<details ${i === 0 && newNotice() ? 'open' : ''}>
  <summary><b>${esc(n.title)}</b><small>${esc(n.id.slice(5, 10).replace('-', '/'))}</small></summary>
  <ul>${n.items.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>`).join('')}</section>` : '';
async function openNotifs() {
  const head = noticesHtml();
  $('#notif-list').innerHTML = head + '<p class="hint">불러오는 중…</p>';
  $('#notif').showModal();
  if (NOTICES.length) lsSet('notice', NOTICES[0].id);
  let list; try { list = await fetchNotifs(); } catch (err) { console.error(err); $('#notif-list').innerHTML = head + '<p class="hint">알림을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>'; return; }
  lsSet('seen', new Date().toISOString()); $('#notif-dot').hidden = true;
  $('#notif-list').innerHTML = head + (list.map(n => n.tg ? `<div class="nt">${avatar(n.id, 'sm')}<p>${n.html}<small>${ago(n.ts)}</small><span class="tg-btns"><button class="btn sm primary" data-act="tg-yes" data-id="${n.tg}">맞아요</button><button class="btn sm" data-act="tg-no" data-id="${n.tg}">아니에요</button></span></p></div>` : `<button type="button" class="nt" data-act="${n.wid ? 'notif-goto' : 'notif-profile'}" data-id="${n.wid || n.id}">${avatar(n.id, 'sm')}<p>${n.html}<small>${ago(n.ts)}</small></p></button>`).join('') || kkEmpty('empty-notif', '최근 2주간 알림이 없어요. 먼저 약올려 보세요.'));
}

export const actions = {
  notif: () => openNotifs(),
  'close-notif': () => $('#notif').close(),
  // 알림 누르면: 댓글·반응 → 그 기록, 팔로우·약올림 → 그 사람 프로필(맞팔로우 버튼 있음)
  'notif-goto': b => { $('#notif').close(); return goToWorkout(b.dataset.id); },
  'notif-profile': b => { $('#notif').close(); return openProfile(b.dataset.id); },
};

// 알림함: 받은 약올림·댓글·반응 (최근 2주)
// ponytail: 앱을 열었을 때만 확인. 휴대폰 푸시 알림은 서버 함수(Edge Function)+VAPID 키가 필요해 다음 단계에서
import { S, sb, ok, $ } from '../state.js';
import { DAY, esc, ago, lsGet, lsSet } from '../lib/util.js';
import { REACTS, typeOf } from '../lib/types.js';
import { nameOf, avatar } from '../lib/calc.js';
import { NOTICES } from '../lib/notices.js';

async function fetchNotifs() {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const [pk, cm, rx] = await Promise.all([
    sb.from('pokes').select('from_id,text,created_at').eq('to_id', S.uid).gte('created_at', since).order('created_at', { ascending: false }).limit(30).then(ok),
    sb.from('comments').select('user_id,body,created_at,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
    sb.from('reactions').select('user_id,kind,created_at,workouts!inner(user_id,title,type)').eq('workouts.user_id', S.uid).neq('user_id', S.uid).gte('created_at', since).limit(30).then(ok),
  ]);
  const what = w => esc(w.title || typeOf(w.type).label);
  return [
    ...pk.map(p => ({ ts: p.created_at, id: p.from_id, html: `<b>${esc(nameOf(p.from_id))}</b>님이 약올림 <mark>${esc(p.text)}</mark>` })),
    ...cm.map(c => ({ ts: c.created_at, id: c.user_id, html: `<b>${esc(nameOf(c.user_id))}</b>님이 "${what(c.workouts)}"에 댓글: ${esc(c.body)}` })),
    ...rx.map(r => ({ ts: r.created_at, id: r.user_id, html: `<b>${esc(nameOf(r.user_id))}</b>님이 "${what(r.workouts)}"에 '${REACTS[r.kind]?.[1] || ''}'` })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));
}
const newNotice = () => NOTICES.length > 0 && NOTICES[0].id !== lsGet('notice');
export async function loadNotifs() {
  $('#notif-dot').hidden = !newNotice();
  try { const list = await fetchNotifs(); if (list.some(n => new Date(n.ts) > new Date(lsGet('seen') || 0))) $('#notif-dot').hidden = false; }
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
  const list = await fetchNotifs();
  lsSet('seen', new Date().toISOString()); $('#notif-dot').hidden = true;
  $('#notif-list').innerHTML = head + (list.map(n => `<div class="nt">${avatar(n.id, 'sm')}<p>${n.html}<small>${ago(n.ts)}</small></p></div>`).join('') || '<p class="hint">최근 2주간 알림이 없어요. 먼저 약올려 보세요.</p>');
}

export const actions = {
  notif: () => openNotifs(),
  'close-notif': () => $('#notif').close(),
};

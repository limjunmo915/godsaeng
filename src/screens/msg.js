// 메시지(supabase/012): 1:1(친구·같은 크루) + 크루 단체방. 상단 종이비행기 → 대화 목록 → 대화방
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, ago, fmtDate, fmtTime, toast, lsGet, lsSet } from '../lib/util.js';
import { avatar, nameOf } from '../lib/calc.js';
import { isFriend, signAvatars } from '../lib/data.js';
import { closeProfile } from './profile.js';

// 대화방 열쇠: 'c:크루id' 또는 'u:상대id'
const keyOf = m => m.crew_id ? 'c:' + m.crew_id : 'u:' + (m.from_id === S.uid ? m.to_id : m.from_id);
const shown = m => !S.blocked.includes(m.from_id) && !S.blocked.includes(m.to_id);
const crewOf = k => S.crews.find(c => 'c:' + c.id === k);
const title = k => crewOf(k)?.name || nameOf(k.slice(2));
// 1:1 은 지금 친구이거나 같은 크루일 때만 보낼 수 있음(서버도 같은 규칙)
const canDM = id => !S.blocked.includes(id) && (isFriend(id) || S.crews.some(c => S.members[c.id]?.includes(id)));

// 읽은 시점은 이 폰에만 저장(마지막으로 본 메시지 시각)
let read; try { read = JSON.parse(lsGet('msgRead')) || {}; } catch { read = {}; }
const unread = k => S.msgs.some(m => keyOf(m) === k && m.from_id !== S.uid && shown(m) && m.created_at > (read[k] || ''));
function markRead(k) {
  const last = S.msgs.filter(m => keyOf(m) === k).at(-1); if (!last) return;
  read[k] = last.created_at; lsSet('msgRead', JSON.stringify(read));
}
const dot = () => { $('#msg-dot').hidden = ![...new Set(S.msgs.map(keyOf))].some(unread); };

export async function loadMsgs() {
  // ponytail: 최근 500개만. 대화가 많아지면 방별로 나눠 불러오기
  S.msgs = ok(await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(500)).reverse();
  const need = [...new Set(S.msgs.flatMap(m => [m.from_id, m.to_id]))].filter(id => id && !S.people[id]);
  if (need.length) { for (const p of ok(await sb.from('profiles').select('*').in('id', need))) S.people[p.id] = p; await signAvatars().catch(console.error); }
  dot();
}

// 앱이 열려 있는 동안 새 메시지를 바로 받음
let ch;
export function listen() {
  if (ch) sb.removeChannel(ch);
  ch = sb.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
    if (S.msgs.some(x => x.id === m.id) || !shown(m)) return;
    S.msgs.push(m);
    if (S.chat === keyOf(m)) { markRead(S.chat); render(); return; }
    dot(); if (!$('#msg').hidden) render();
    else if (m.from_id !== S.uid) toast(`${crewOf(keyOf(m)) ? crewOf(keyOf(m)).name + ' · ' : ''}${nameOf(m.from_id)}: ${m.body.slice(0, 40)}`);
  }).subscribe();
}

const top = (h, right = '') => `<header class="pp-top"><button class="icbtn" data-act="msg-back" aria-label="뒤로">${ic('chevron-left')}</button><h2>${h}</h2><div>${right}</div></header>`;
const crewAv = () => `<span class="av crew-av">${ic('users')}</span>`;

function render() {
  const el = $('#msg-body');
  if (S.chat === 'new') {
    const ids = [...new Set([...S.following.filter(isFriend), ...S.crews.flatMap(c => S.members[c.id] || [])])].filter(id => id !== S.uid && canDM(id));
    el.innerHTML = top('새 메시지') + `<p class="hint">친구와 같은 크루 사람에게 보낼 수 있어요.</p>`
      + (ids.map(id => `<button type="button" class="frow msg-row" data-act="msg-open" data-k="u:${id}">${avatar(id)}<span class="nm"><span>${esc(nameOf(id))}</span></span></button>`).join('') || '<p class="hint">아직 보낼 수 있는 사람이 없어요. 친구를 맺거나 크루에 들어가 보세요.</p>');
    return;
  }
  if (!S.chat) {
    const keys = [...new Set([...S.crews.map(c => 'c:' + c.id), ...S.msgs.filter(shown).map(keyOf)])];
    const last = k => S.msgs.findLast(m => keyOf(m) === k && shown(m));
    keys.sort((a, b) => (last(b)?.created_at || '').localeCompare(last(a)?.created_at || ''));
    el.innerHTML = top('메시지', `<button class="icbtn" data-act="msg-new" aria-label="새 메시지">${ic('pencil')}</button>`)
      + (keys.map(k => { const m = last(k);
        return `<button type="button" class="frow msg-row ${unread(k) ? 'unread' : ''}" data-act="msg-open" data-k="${k}">${crewOf(k) ? crewAv() : avatar(k.slice(2))}
          <span class="nm"><span>${esc(title(k))}${crewOf(k) ? ' <em>크루</em>' : ''}<small>${m ? esc((m.from_id === S.uid ? '나: ' : crewOf(k) ? nameOf(m.from_id) + ': ' : '') + m.body) : '아직 대화가 없어요'}</small></span></span>
          ${m ? `<small class="when">${ago(m.created_at)}</small>` : ''}</button>`; }).join('') || '<p class="hint">크루에 들어가거나 친구를 맺으면 메시지를 보낼 수 있어요.</p>');
    return;
  }
  const k = S.chat, crew = crewOf(k), other = !crew && k.slice(2), list = S.msgs.filter(m => keyOf(m) === k && shown(m));
  let day = '';
  el.innerHTML = top(crew ? esc(crew.name) : `<button type="button" class="who-nm" data-act="profile" data-id="${other}">${esc(nameOf(other))}</button>`)
    + `<div class="bubbles">${list.map((m, i) => {
      const mine = m.from_id === S.uid, d = fmtDate(m.created_at), head = !mine && list[i - 1]?.from_id !== m.from_id;
      const sep = d !== day ? `<p class="day">${day = d}</p>` : '';
      return `${sep}<div class="bub ${mine ? 'mine' : ''}">${!mine ? (head ? avatar(m.from_id, 'sm') : '<span class="av-gap"></span>') : ''}<div>
        ${crew && head ? `<b>${esc(nameOf(m.from_id))}</b>` : ''}<p ${mine ? `data-act="msg-del" data-id="${m.id}" title="눌러서 삭제"` : ''}>${esc(m.body)}</p><small>${fmtTime(m.created_at)}</small></div></div>`;
    }).join('') || '<p class="hint">첫 메시지를 보내 보세요. 약올리기는 자유!</p>'}</div>`
    + (crew || canDM(other)
      ? `<form class="msg-form" data-form="msg"><textarea name="body" rows="1" maxlength="1000" placeholder="메시지 보내기" aria-label="메시지"></textarea><button class="icbtn" aria-label="보내기">${ic('send')}</button></form>`
      : '<p class="hint msg-form">친구이거나 같은 크루일 때만 메시지를 보낼 수 있어요.</p>');
  $('#msg').scrollTo(0, $('#msg').scrollHeight);
}

function open(k) {
  S.chat = k; markRead(k); dot();
  $('#msg').hidden = false; document.body.classList.add('pp-open');
  render();
}
export function closeMsg() {
  $('#msg').hidden = true; S.chat = null;
  if (!document.querySelector('.pp:not([hidden])')) document.body.classList.remove('pp-open');
}

// 대화방에서 Enter = 보내기, Shift+Enter = 줄바꿈
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.closest('.msg-form textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
});

export const actions = {
  'msg-list': () => open(null),
  'msg-new': () => { S.chat = 'new'; render(); },
  'msg-open': b => open(b.dataset.k),
  // 프로필의 '메시지' 버튼: 프로필 위에 대화방을 띄움
  'msg-to': b => { closeProfile(); open('u:' + b.dataset.id); },
  'msg-back': () => S.chat ? open(null) : closeMsg(),
  'msg-del': async b => {
    if (!confirm('이 메시지를 지울까요? 상대 화면에서도 사라져요.')) return;
    ok(await sb.from('messages').delete().eq('id', b.dataset.id));
    S.msgs = S.msgs.filter(m => m.id !== b.dataset.id); render();
  },
};
export const forms = {
  msg: async (f, d) => {
    if (!d.body) return;
    const k = S.chat, row = { body: d.body, ...(k.startsWith('c:') ? { crew_id: k.slice(2) } : { to_id: k.slice(2) }) };
    const m = ok(await sb.from('messages').insert(row).select().single());
    if (!S.msgs.some(x => x.id === m.id)) S.msgs.push(m);
    markRead(k); render(); $('#msg-body textarea')?.focus();
  },
};

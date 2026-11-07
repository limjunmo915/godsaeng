// 함께한 운동(supabase/017, 스트라바 '그룹 활동' 벤치마킹)
// 카드: '함께 · 민수님, 지은님' / 확인 대기는 [맞아요][아니에요] / 내 기록엔 '함께한 사람 추가'(크루원·친구에게 요청 → 수락하면 함께)
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, toast } from '../lib/util.js';
import { avatar, nameOf } from '../lib/calc.js';
import { loadFeed, loadMine, loadTogether, isFriend } from '../lib/data.js';
import { refresh } from '../nav.js';

const nm = r => r.partner === S.uid ? '나' : (S.people[r.partner]?.nickname || r.name);
// 확인 대기 줄의 '상대': 내가 partner 면 카드 주인
const otherName = (w, r) => r.partner === S.uid ? nameOf(w.user_id) : (nm(r) || '누군가');

export function tgLine(w) {
  const rs = S.tg?.[w.id]; if (!rs) return '';   // SQL 017 실행 전·프로필 화면 등 안 불러온 곳은 안 보임
  const oks = rs.filter(r => r.status === 'ok'), out = [];
  if (oks.length) {
    const names = oks.map(nm).filter(Boolean).slice(0, 3).map(n => n === '나' ? n : n + '님'), more = oks.length - names.length;
    out.push(`<button type="button" class="tg" data-act="tg-open">${ic('users')}<span>함께 · <b>${esc(names.join(', '))}</b>${more > 0 ? ` 외 ${more}명` : ''}</span></button>`);
  }
  for (const r of rs.filter(r => r.status === 'ask')) {
    if (r.asked_by === S.uid) { out.push(`<p class="tg-ask">${ic('users')}<span>${esc(otherName(w, r))}님에게 함께 요청 보냄</span><button class="linkbtn" data-act="tg-no" data-id="${r.id}">취소</button></p>`); continue; }
    out.push(`<div class="tg-ask">${ic('users')}<span>${esc(otherName(w, r))}님${r.asked_by ? '이 함께 운동했다고 해요' : '과 함께했나요?'}</span>
      <button class="btn sm primary" data-act="tg-yes" data-id="${r.id}">맞아요</button><button class="btn sm" data-act="tg-no" data-id="${r.id}">아니에요</button></div>`);
  }
  if (!oks.length && w.user_id === S.uid && w.visibility !== 'private') out.push(`<button type="button" class="linkbtn tg-add" data-act="tg-open">${ic('users')}함께한 사람 추가</button>`);
  return out.join('');
}

// 함께한 사람 목록 + (내 기록이면) 크루원·친구 중 골라 요청
function renderTg() {
  const w = S.tgW, rs = S.tg[w.id] || [], mine = w.user_id === S.uid;
  const has = new Set(rs.map(r => r.partner));
  const list = rs.filter(r => r.status === 'ok').map(r => `<div class="frow">${nm(r)
    ? `<button type="button" class="nm" data-act="profile" data-id="${r.partner}">${avatar(r.partner, 'sm')}<span>${esc(nm(r))}</span></button>`
    : `<span class="nm">${avatar(r.partner, 'sm')}<span>모르는 사람</span></span>`}
    ${mine || r.partner === S.uid ? `<button class="linkbtn" data-act="tg-no" data-id="${r.id}">${r.partner === S.uid ? '나 빼기' : '빼기'}</button>` : ''}</div>`);
  const cands = mine && w.visibility !== 'private' ? [...new Set([...Object.values(S.members).flat(), ...S.following.filter(isFriend)])]
    .filter(id => id !== S.uid && !has.has(id) && !S.blocked.includes(id)) : [];
  $('#tg-list').innerHTML = (list.join('') || '<p class="hint">아직 함께한 사람이 없어요.</p>')
    + (cands.length ? `<p class="set-sub">크루원·친구에게 함께했다고 요청하기</p>${cands.map(id => `<div class="frow"><span class="nm">${avatar(id, 'sm')}<span>${esc(nameOf(id))}</span></span><button class="btn sm" data-act="tg-ask" data-id="${id}">요청</button></div>`).join('')}
      <p class="hint">상대가 수락하면 서로의 기록에 '함께'로 보여요. 상대에게 이 시간 기록이 없으면 내 기록이 복사돼요.</p>` : '');
}

async function again(w) {
  if (w) await loadTogether([w.id]);
  refresh(); if ($('#tg-dlg').open) renderTg();
}

export const actions = {
  'tg-open': (b, w) => { S.tgW = w; renderTg(); $('#tg-dlg').showModal(); },
  'tg-close': () => $('#tg-dlg').close(),
  'tg-ask': async b => {
    b.disabled = true;
    ok(await sb.rpc('ask_together', { wid: S.tgW.id, who: b.dataset.id }));
    toast(`${nameOf(b.dataset.id)}님에게 요청했어요`); return again(S.tgW);
  },
  // 맞아요·수락: 복사본이 생길 수 있어 피드를 다시 불러옴
  'tg-yes': async b => {
    b.disabled = true;
    ok(await sb.rpc('answer_together', { tid: +b.dataset.id }));
    if ($('#notif').open) $('#notif').close();
    toast('함께한 운동으로 표시했어요');
    await Promise.all([loadFeed(true), loadMine()]); refresh();
  },
  // 아니에요·거절·빼기·요청 취소
  'tg-no': async (b, w) => {
    b.disabled = true;
    ok(await sb.rpc('drop_together', { tid: +b.dataset.id }));
    if ($('#notif').open) { b.closest('.nt')?.remove(); return; }
    return again(w || S.tgW);
  },
};

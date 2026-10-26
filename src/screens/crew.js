// 크루: 초대코드, 멤버, 챌린지
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { DAY, esc, toLocalInput, lsSet, toast } from '../lib/util.js';
import { METRIC } from '../lib/types.js';
import { nameOf, crew, avatar } from '../lib/calc.js';
import { loadCore, loadFeed, crewTotals } from '../lib/data.js';
import { refresh } from '../nav.js';
import { total, crewPicker } from './rank.js';
import { renderFriends, tabs } from './friends.js';

const joinForms = open => `
  <details class="panel" ${open ? 'open' : ''}><summary>초대코드로 크루 들어가기</summary>
    <form class="inline" data-form="crew-join"><input type="text" name="code" maxlength="6" placeholder="A1B2C3" aria-label="초대코드" autocapitalize="characters"><button class="btn">들어가기</button></form></details>
  <details class="panel" ${open ? 'open' : ''}><summary>새 크루 만들기</summary>
    <form class="inline" data-form="crew-new"><input type="text" name="name" maxlength="30" placeholder="질수없다 러닝크루" aria-label="크루 이름" required><button class="btn">만들기</button></form></details>`;

export async function renderCrew() {
  if (S.crewTab === 'friends') return renderFriends();
  const v = $('#v-crew'), c = crew();
  if (!c) return v.innerHTML = `<h2 class="page-title">크루</h2>${tabs()}<p class="lead">크루 안에서만 기록이 공유돼요. 초대코드를 받았다면 입력하고, 아니면 새로 만들어서 코드를 보내 주세요.</p>` + joinForms(true);

  const chs = ok(await sb.from('challenges').select('*').eq('crew_id', c.id).order('end_date', { ascending: false }).limit(10));
  const blocks = await Promise.all(chs.map(async ch => {
    const from = new Date(ch.start_date + 'T00:00'), to = new Date(ch.end_date + 'T00:00').getTime() + DAY;
    const by = await crewTotals(from, to, c.id), m = METRIC[ch.metric];
    const rows = Object.entries(by).map(([id, l]) => [id, total(l, ch.metric)]).sort((a, b) => b[1] - a[1]);
    const live = Date.now() >= from && Date.now() < to, done = Date.now() >= to;
    return `<article class="ch">
      <header><div><b>${esc(ch.title)}</b><span>${ch.start_date.slice(5).replace('-', '.')} ~ ${ch.end_date.slice(5).replace('-', '.')} · 목표 ${m.fmt(ch.target)}</span></div>
        <span class="state ${live ? 'live' : ''}">${live ? '진행 중' : done ? '종료' : '예정'}</span></header>
      ${ch.bet ? `<p class="bet">${ic('target')}${esc(ch.bet)}</p>` : ''}
      ${rows.map(([id, val]) => `<div class="prow">${avatar(id, 'sm')}<div><span>${esc(nameOf(id))}${val >= ch.target ? ic('medal', 'gold') : ''}</span><div class="bar"><i style="width:${Math.min(100, val / ch.target * 100)}%"></i></div></div><span class="val">${m.fmt(val)}</span></div>`).join('')}
      ${done && rows[0]?.[1] > 0 ? `<p class="hint">우승 ${esc(nameOf(rows[0][0]))}${ch.bet ? ` · 꼴찌 ${esc(nameOf(rows.at(-1)[0]))} 당첨` : ''}</p>` : ''}
      ${ch.created_by === S.uid ? `<button class="linkbtn danger" data-act="del-ch" data-id="${ch.id}">챌린지 삭제</button>` : ''}
    </article>`;
  }));
  const iso = d => toLocalInput(d).slice(0, 10), today = new Date();

  v.innerHTML = `<h2 class="page-title">크루</h2>${tabs()}${crewPicker()}
    <section class="crew-card">
      <div class="crew-top"><b>${esc(c.name)}</b><span>${S.members[c.id].length}명</span></div>
      <div class="code-row"><div><span>초대코드</span><code>${esc(c.invite_code)}</code></div><button class="btn" data-act="copy">${ic('copy')}초대 문구 복사</button></div>
      <div class="members">${S.members[c.id].map(id => `<span>${avatar(id, 'sm')}${esc(nameOf(id))}</span>`).join('')}</div>
    </section>
    <h3 class="sec">챌린지</h3>
    ${blocks.join('') || '<p class="hint">아직 챌린지가 없어요. 내기 하나 걸어 보세요.</p>'}
    <details class="panel"><summary>새 챌린지 만들기</summary>
      <form class="stack" data-form="challenge">
        <label class="field"><span>제목</span><input type="text" name="title" maxlength="40" placeholder="10월 100km 달성"></label>
        <div class="row">
          <label class="field"><span>기준</span><select name="metric">${Object.entries(METRIC).filter(([, m]) => m.challenge !== false).map(([k, m]) => `<option value="${k}">${m.label} (${m.unit})</option>`).join('')}</select></label>
          <label class="field"><span>목표</span><input type="number" name="target" min="1" inputmode="decimal" placeholder="100"></label>
        </div>
        <div class="row">
          <label class="field"><span>시작</span><input type="date" name="start" value="${iso(today)}"></label>
          <label class="field"><span>끝</span><input type="date" name="end" value="${iso(new Date(+today + 6 * DAY))}"></label>
        </div>
        <label class="field"><span>내기 (선택)</span><input type="text" name="bet" maxlength="60" placeholder="꼴찌가 커피 쏘기"></label>
        <button class="btn primary">챌린지 시작</button>
      </form></details>
    ${joinForms(false)}
    <button class="linkbtn danger" data-act="leave">이 크루에서 나가기</button>`;
}

export const actions = {
  copy: async () => {
    const text = `갓생살기 크루 "${crew().name}" 초대코드: ${crew().invite_code}\n${location.origin + location.pathname}`;
    try { await navigator.clipboard.writeText(text); toast('초대 문구를 복사했어요'); } catch { toast('초대코드: ' + crew().invite_code); }
  },
  leave: async () => {
    if (!confirm(`"${crew().name}" 크루에서 나갈까요?`)) return;
    ok(await sb.from('crew_members').delete().eq('crew_id', S.crewId).eq('user_id', S.uid));
    lsSet('crew', ''); await loadCore(); await loadFeed(true); return refresh();
  },
  'del-ch': async b => {
    if (!confirm('이 챌린지를 삭제할까요?')) return;
    ok(await sb.from('challenges').delete().eq('id', b.dataset.id)); return refresh();
  },
};

export const forms = {
  'crew-new': async (f, d) => {
    const c = ok(await sb.rpc('create_crew', { crew_name: d.name }));
    S.crewId = c.id; lsSet('crew', c.id); await loadCore(); toast(`"${c.name}" 크루를 만들었어요. 초대코드를 친구에게 보내세요`); return refresh();
  },
  'crew-join': async (f, d) => {
    const c = ok(await sb.rpc('join_crew', { code: d.code }));
    S.crewId = c.id; lsSet('crew', c.id); await loadCore(); await loadFeed(true); toast(`"${c.name}" 크루에 들어왔어요`); return refresh();
  },
  challenge: async (f, d) => {
    const row = { crew_id: S.crewId, title: d.title, metric: d.metric, target: +d.target, start_date: d.start, end_date: d.end, bet: d.bet || null };
    if (!row.title || !(row.target > 0) || !row.start_date || !row.end_date || row.end_date < row.start_date) return toast('제목, 목표, 기간을 확인해 주세요.');
    ok(await sb.from('challenges').insert(row)); toast('챌린지 시작! 질 수 없다'); return refresh();
  },
};

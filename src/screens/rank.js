// 랭킹: 크루별 주/월/연 순위
import { S, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, startOf, lsSet } from '../lib/util.js';
import { METRIC } from '../lib/types.js';
import { nameOf, avatar } from '../lib/calc.js';
import { crewTotals } from '../lib/data.js';
import { refresh } from '../nav.js';

export const total = (list, metric) => metric === 'count' ? list.length : list.reduce((a, w) => a + METRIC[metric].get(w), 0);
export const seg = (name, cur, opts) => `<div class="seg" data-seg="${name}" role="group">${opts.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
export const crewPicker = () => S.crews.length > 1
  ? `<div class="chips">${S.crews.map(c => `<button class="chip" data-act="crew" data-id="${c.id}" aria-pressed="${c.id === S.crewId}">${esc(c.name)}</button>`).join('')}</div>` : '';

export async function renderRank() {
  const v = $('#v-rank');
  if (!S.crewId) return v.innerHTML = `<div class="empty">${ic('trophy', 'big')}<b>크루가 없어요</b><p>크루에 들어가면 순위가 매겨져요.</p><button class="btn primary" data-act="go" data-tab="crew">크루로 가기</button></div>`;
  const by = await crewTotals(startOf(S.rPeriod));
  const rows = Object.entries(by).map(([id, l]) => [id, total(l, S.rMetric)]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(r => r[1])), M = METRIC[S.rMetric];
  v.innerHTML = `<h2 class="page-title">랭킹</h2>${crewPicker()}
    <div class="controls">${seg('rPeriod', S.rPeriod, [['week', '이번 주'], ['month', '이번 달'], ['year', '올해']])}
      ${seg('rMetric', S.rMetric, Object.entries(METRIC).map(([k, m]) => [k, m.short]))}</div>
    <ol class="rank">${rows.map(([id, val], i) => {
      const tag = i === 0 && val > 0 ? '<span class="tag hot">갓생러</span>' : val === 0 ? '<span class="tag">누워있음</span>' : (i === rows.length - 1 && rows.length > 2 ? '<span class="tag">꼴찌</span>' : '');
      return `<li class="rk ${id === S.uid ? 'me' : ''}"><span class="pos">${i === 0 && val > 0 ? ic('crown') : i + 1}</span>${avatar(id)}
        <div class="mid"><b>${esc(nameOf(id))}</b>${tag}<div class="bar"><i style="width:${val / max * 100}%"></i></div></div>
        <span class="val">${M.fmt(val)}</span>
        ${id !== S.uid ? `<button class="taunt-btn sm" data-act="poke" data-to="${id}" data-crew="${S.crewId}">${i === 0 ? '견제' : '약올리기'}</button>` : '<span></span>'}</li>`;
    }).join('')}</ol>
    <p class="hint">크루 공개 기록만 집계돼요.${S.rMetric === 'points' ? ' 갓생 포인트는 운동 강도 × 시간이라, 산책 1시간(21P)보다 테니스 1시간(44P)이 더 높아요.' : ''}</p>`;
}

export const actions = {
  crew: b => { S.crewId = b.dataset.id; lsSet('crew', S.crewId); return refresh(); },
};

// '언제' 고르기: 누르면 바로 달력(앞뒤 달 이동, 앞으로 올 날은 못 고름) + 시간. 값은 숨은 #f-when 에 'YYYY-MM-DDTHH:MM' 로
import { $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { toLocalInput, fmtDate, fmtTime } from '../lib/util.js';

let cur, view;   // cur: 고른 날짜·시각, view: 보고 있는 달의 1일
const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const whenLabel = () => { const v = $('#f-when').value; $('#when-btn').textContent = v ? `${fmtDate(v)} ${fmtTime(v)}` : '언제 했나요?'; };

function draw() {
  const y = view.getFullYear(), m = view.getMonth(), now = new Date(), blank = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const last = y === now.getFullYear() && m === now.getMonth();
  $('#when-cal').innerHTML = `<div class="when-head"><button type="button" class="icbtn" data-act="when-month" data-v="-1" aria-label="이전 달">${ic('chevron-left')}</button>
      <b>${y}년 ${m + 1}월</b><button type="button" class="icbtn" data-act="when-month" data-v="1" aria-label="다음 달" ${last ? 'disabled' : ''}>${ic('chevron-right')}</button></div>
    <div class="cal">${'월화수목금토일'.split('').map(d => `<span class="h">${d}</span>`).join('')}${'<span></span>'.repeat(blank)}${Array.from({ length: days }, (_, i) => {
      const d = new Date(y, m, i + 1);
      return `<button type="button" class="d${same(d, cur) ? ' sel' : ''}${same(d, now) ? ' today' : ''}" data-act="when-day" data-v="${i + 1}" ${d > now ? 'disabled' : ''}>${i + 1}</button>`;
    }).join('')}</div>`;
  $('#when-time').value = `${String(cur.getHours()).padStart(2, '0')}:${String(cur.getMinutes()).padStart(2, '0')}`;
}

export const actions = {
  'when-open': () => { cur = new Date($('#f-when').value || Date.now()); view = new Date(cur.getFullYear(), cur.getMonth(), 1); draw(); $('#when-dlg').showModal(); },
  'when-month': b => { view = new Date(view.getFullYear(), view.getMonth() + +b.dataset.v, 1); draw(); },
  'when-day': b => { cur = new Date(view.getFullYear(), view.getMonth(), +b.dataset.v, cur.getHours(), cur.getMinutes()); draw(); },
  'when-now': () => { cur = new Date(); view = new Date(cur.getFullYear(), cur.getMonth(), 1); draw(); },
  'when-cancel': () => $('#when-dlg').close(),
  'when-ok': () => {
    const [h, mi] = ($('#when-time').value || '00:00').split(':').map(Number);
    cur.setHours(h, mi, 0, 0); if (cur > new Date()) cur = new Date();   // 오늘인데 지금보다 늦은 시각이면 지금으로
    $('#f-when').value = toLocalInput(cur); $('#f-when').dispatchEvent(new Event('change'));
    whenLabel(); $('#when-dlg').close();
  },
};

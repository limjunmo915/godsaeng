// 내 몸 탭: 본인 전용 (body_profile / body_logs 는 RLS 로 본인만 접근)
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { DAY, esc, fmtNum, dayKey, toLocalInput, toast } from '../lib/util.js';
import { BODY } from '../lib/types.js';
import { sum, latest, age, bmr } from '../lib/calc.js';
import { loadBody } from '../lib/data.js';
import { refresh } from '../nav.js';
import { meHead } from './me.js';
import { seg } from './rank.js';
import { syncForm } from './log.js';

function lineChart(pts, unit, d) {
  if (pts.length < 2) return '<p class="hint">측정 기록이 2개 이상 쌓이면 추이 그래프가 그려져요.</p>';
  const W = 600, H = 190, L = 44, R = 12, T = 14, B = 26;
  const t0 = pts[0].t, t1 = pts.at(-1).t || t0 + 1, vs = pts.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * .15 || 1; lo -= pad; hi += pad;
  const x = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const lbl = t => { const dt = new Date(t); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  return `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} 추이 그래프">
    ${[hi - pad, (hi + lo) / 2, lo + pad].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v, d)}</text>`).join('')}
    <polygon points="${L},${H - B} ${line} ${x(pts.at(-1).t)},${H - B}" class="area"/>
    <polyline points="${line}" class="ln"/>
    ${pts.map((p, i) => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 5 : 3}" class="pt"/>`).join('')}
    <text x="${L}" y="${H - 6}">${lbl(t0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${lbl(pts.at(-1).t)}</text>
  </svg>`;
}

export async function renderBody() {
  const p = S.body.p || {}, logs = S.body.logs, a = age(), h = p.height_cm, w = latest('weight_kg'), fat = latest('body_fat_pct');
  const bmi = w && h ? w / (h / 100) ** 2 : null;
  // 대한비만학회 기준
  const bmiCat = !bmi ? '' : bmi < 18.5 ? '저체중' : bmi < 23 ? '정상' : bmi < 25 ? '비만 전단계' : bmi < 30 ? '1단계 비만' : bmi < 35 ? '2단계 비만' : '3단계 비만';
  const base = bmr(), today = sum(S.mine.filter(x => dayKey(x.started_at) === dayKey(Date.now()))).kcal;
  const m = BODY[S.bodyMetric], pts = logs.filter(l => l[S.bodyMetric] != null).map(l => ({ t: +new Date(l.measured_on + 'T00:00'), v: +l[S.bodyMetric] }));
  const delta = (k, days) => {
    const s = logs.filter(l => l[k] != null); if (s.length < 2) return '';
    const last = s.at(-1), from = s.find(l => +new Date(l.measured_on) >= +new Date(last.measured_on) - days * DAY);
    const dd = last[k] - from[k], good = (k === 'muscle_kg') === (dd > 0);
    return dd ? `<em class="${good ? 'up' : 'down'}">${ic(dd > 0 ? 'trending-up' : 'trending-down')}${fmtNum(Math.abs(dd), BODY[k].d)}${BODY[k].unit} · ${days}일</em>` : '<em>변화 없음</em>';
  };
  const last = logs.at(-1), todayIso = toLocalInput(Date.now()).slice(0, 10), editing = logs.find(l => l.measured_on === todayIso) || {};
  const tile = (label, val, sub = '') => `<div class="tile"><small>${label}</small><b>${val ?? '–'}</b>${sub}</div>`;

  $('#v-me').innerHTML = meHead(`신체 기록 ${logs.length}건`) + `
    <section class="private">${ic('lock')}<div><b>개인용 기록이에요</b><p>이 탭의 나이·키·체중·체지방·근육량은 나만 볼 수 있어요. 크루원을 포함한 다른 사람에게는 보이지 않고, 랭킹이나 피드에도 나오지 않아요. 칼로리를 내 몸에 맞게 계산하는 데만 쓰여요.</p></div></section>
    <div class="tiles">
      ${tile('체중', w != null ? `${fmtNum(w, 1)}<small> kg</small>` : null, delta('weight_kg', 30))}
      ${tile('체지방률', fat != null ? `${fmtNum(fat, 1)}<small> %</small>` : null, delta('body_fat_pct', 30))}
      ${tile('골격근량', latest('muscle_kg') != null ? `${fmtNum(latest('muscle_kg'), 1)}<small> kg</small>` : null, delta('muscle_kg', 30))}
      ${tile('BMI', bmi ? fmtNum(bmi, 1) : null, `<em>${bmiCat || '키·체중 입력 필요'}</em>`)}
      ${tile('기초대사량', base ? `${fmtNum(base)}<small> kcal</small>` : null, `<em>${base ? '가만히 있어도 쓰는 열량' : '나이·성별·키·체중 필요'}</em>`)}
      ${tile('오늘 총 소모', base ? `${fmtNum(Math.round(base * 1.2 + today))}<small> kcal</small>` : null, `<em>${base ? `일상 ${fmtNum(Math.round(base * 1.2))} + 운동 ${fmtNum(today)}` : '기초대사량 필요'}</em>`)}
    </div>
    <h3 class="sec">추이</h3>
    ${seg('bodyMetric', S.bodyMetric, Object.entries(BODY).map(([k, b]) => [k, b.label]))}
    ${lineChart(pts, m.unit, m.d)}
    <details class="panel" ${logs.length ? '' : 'open'}><summary>오늘 측정값 기록하기</summary>
      <form class="stack" data-form="body-log">
        <div class="row">
          <label class="field"><span>측정일</span><input type="date" name="date" value="${todayIso}" max="${todayIso}"></label>
          ${Object.entries(BODY).map(([k, b]) => `<label class="field"><span>${b.label} (${b.unit})</span><input type="number" name="${k}" step="0.1" inputmode="decimal" value="${editing[k] ?? ''}" placeholder="${last?.[k] ?? ''}"></label>`).join('')}
        </div>
        <label class="field"><span>메모</span><input type="text" name="memo" maxlength="200" value="${esc(editing.memo || '')}" placeholder="아침 공복, 인바디"></label>
        <p class="hint">같은 날짜로 다시 저장하면 그날 기록을 덮어써요. 빈 칸은 저장하지 않아요.</p>
        <button class="btn primary">${ic('lock')}나만 보게 저장</button>
      </form></details>
    <details class="panel" ${p.birth_year && p.sex && p.height_cm ? '' : 'open'}><summary>기본 정보 (나이·성별·키)</summary>
      <form class="stack" data-form="body-info"><div class="row">
        <label class="field"><span>출생연도</span><input type="number" name="year" min="1900" max="${new Date().getFullYear()}" value="${p.birth_year ?? ''}" placeholder="1995"></label>
        <label class="field"><span>성별 (칼로리 공식용)</span><select name="sex"><option value="">선택</option><option value="male" ${p.sex === 'male' ? 'selected' : ''}>남</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>여</option></select></label>
        <label class="field"><span>키 (cm)</span><input type="number" name="height" min="80" max="250" step="0.1" value="${p.height_cm ?? ''}"></label>
      </div>${a ? `<p class="hint">연 나이 ${a}세로 계산해요.</p>` : ''}<button class="btn">저장</button></form></details>
    ${logs.length ? `<h3 class="sec">측정 기록</h3><div class="loglist">${[...logs].reverse().map(l => `<div><span>${l.measured_on.slice(5).replace('-', '/')}${l.memo ? ` <small>${esc(l.memo)}</small>` : ''}</span>
      <b>${Object.entries(BODY).filter(([k]) => l[k] != null).map(([k, b]) => `${fmtNum(l[k], b.d)}${b.unit}`).join(' · ')}</b><button class="icbtn sm" data-act="del-log" data-id="${l.id}" aria-label="측정 기록 삭제">${ic('x')}</button></div>`).join('')}</div>` : ''}
    <p class="hint">칼로리 계산: 평균 심박을 넣은 운동은 심박·나이·성별·체중으로(Keytel 공식), 아니면 운동 강도(MET) × 체중 × 시간으로 계산해요. 기초대사량은 Mifflin-St Jeor 공식이에요. 모든 수치는 참고용이에요.</p>`;
}

export const actions = {
  'del-log': async b => {
    if (!confirm('이 측정 기록을 삭제할까요?')) return;
    ok(await sb.from('body_logs').delete().eq('id', b.dataset.id)); await loadBody(); syncForm(); return refresh();
  },
};

export const forms = {
  'body-info': async (f, d) => {
    ok(await sb.from('body_profile').upsert({ user_id: S.uid, birth_year: +d.year || null, sex: d.sex || null, height_cm: +d.height || null, updated_at: new Date().toISOString() }));
    await loadBody(); syncForm(); toast('기본 정보를 저장했어요'); return refresh();
  },
  'body-log': async (f, d) => {
    const row = { user_id: S.uid, measured_on: d.date, memo: d.memo || null };
    for (const k of Object.keys(BODY)) { const x = parseFloat(d[k]); row[k] = isFinite(x) ? x : null; }
    if (Object.keys(BODY).every(k => row[k] == null)) return toast('측정값을 하나 이상 입력해 주세요.');
    ok(await sb.from('body_logs').upsert(row, { onConflict: 'user_id,measured_on' }));
    await loadBody(); syncForm(); toast('측정 기록을 저장했어요'); return refresh();
  },
};

// 나: 운동 통계·캘린더·검색·배지·장비·설정 (내 몸 탭은 body.js)
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { DAY, esc, fmtNum, fmtDur, fmtDurS, fmtDist, fmtDate, startOf, dayKey, toast, fail, compress } from '../lib/util.js';
import { typeOf } from '../lib/types.js';
import { sum, pace, effort, streaks, badges, avatar } from '../lib/calc.js';
import { loadGear, signAvatars } from '../lib/data.js';
import { refresh } from '../nav.js';
import { seg } from './rank.js';
import { goToWorkout } from './feed.js';
import { shareRecap } from './share.js';
import { initGearSelect } from './log.js';
import { renderBody } from './body.js';

export const meHead = sub => `
  <div class="profile">${avatar(S.uid, 'lg')}<div><b>${esc(S.me.nickname)}</b><span>${sub}</span></div></div>
  ${seg('meTab', S.meTab, [['stats', '운동 기록'], ['body', '내 몸']])}`;

// 내 기록 검색: 공백으로 나눈 단어가 모두 들어있는 기록 (날짜는 2026-10-13 / 10/13 / 10월 13일 모두 매칭)
function haystack(w) {
  const d = new Date(w.started_at), y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return [`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, `${m}/${day}`, `${m}월`, `${day}일`, `${y}년`, typeOf(w.type).label, w.type, w.title, w.memo, w.brag].join(' ').toLowerCase();
}
function searchResults() {
  const words = (S.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  let list;
  if (S.qDay) list = S.mine.filter(w => dayKey(w.started_at) === S.qDay);
  else if (words.length) list = S.mine.filter(w => { const h = haystack(w); return words.every(x => h.includes(x)); });
  else return '';
  const head = S.qDay ? `<p class="hint">${fmtDate(list[0]?.started_at || Date.now())} 기록 ${list.length}개 · <button class="linkbtn" data-act="clear-q">닫기</button></p>`
    : `<p class="hint">${list.length}개 찾음${list.length > 30 ? ' (최근 30개만 표시)' : ''}</p>`;
  return head + list.slice(0, 30).map(w => { const t = typeOf(w.type); return `<button type="button" class="res" data-act="goto" data-id="${w.id}">
    <span class="ticon">${ic(t.icon)}</span><span><b>${esc(w.title || t.label)}</b><small>${fmtDate(w.started_at)} · ${esc(t.label)} · ${fmtDurS(w.duration_min)}${+w.distance_km ? ' · ' + fmtDist(w) : ''}</small></span>${ic('chevron-right')}</button>`; }).join('');
}
document.addEventListener('input', e => {
  if (e.target.id !== 'me-search') return;
  S.q = e.target.value; S.qDay = null; $('#me-results').innerHTML = searchResults();
});

export async function renderMe() {
  if (S.meTab === 'body') return renderBody();
  const v = $('#v-me'), me = S.me, mine = S.mine;
  S.calMonth ??= new Date(startOf('month'));
  const wk = startOf('week'), in_ = (a, b) => mine.filter(w => { const t = +new Date(w.started_at); return t >= a && t < b; });
  const tw = sum(in_(wk, Infinity)), lw = sum(in_(wk - 7 * DAY, wk)), mo = startOf('month'), tm = sum(in_(mo, Infinity));
  const diff = (a, b, f) => { const d = a - b; return d ? `<em class="${d > 0 ? 'up' : 'down'}">${ic(d > 0 ? 'trending-up' : 'trending-down')}${f(Math.abs(d))}</em>` : '<em>지난주와 같음</em>'; };
  const st = streaks(mine);

  // 12주 그래프
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = wk - (11 - i) * 7 * DAY; return { s, v: sum(in_(s, s + 7 * DAY)).minutes }; });
  const wmax = Math.max(1, ...weeks.map(w => w.v));
  // 캘린더
  const cm = S.calMonth, lead = (cm.getDay() + 6) % 7, dim = new Date(cm.getFullYear(), cm.getMonth() + 1, 0).getDate();
  const byDay = {}; for (const w of mine) (byDay[dayKey(w.started_at)] ??= []).push(w);
  const cells = Array.from({ length: lead }, () => '<span></span>').join('') + Array.from({ length: dim }, (_, i) => {
    const d = new Date(cm.getFullYear(), cm.getMonth(), i + 1), ws = byDay[dayKey(d)] || [], today = dayKey(d) === dayKey(Date.now());
    if (!ws.length) return `<span class="d ${today ? 'today' : ''}">${i + 1}</span>`;
    return `<button type="button" class="d on ${today ? 'today' : ''}" data-act="day" data-day="${dayKey(d)}" aria-label="${cm.getMonth() + 1}월 ${i + 1}일 ${ws.map(w => typeOf(w.type).label).join(', ')} 기록 보기">${ic(typeOf(ws[0].type).icon)}<span>${i + 1}</span></button>`;
  }).join('');
  // 종목별, 최고기록, 장비
  const byType = {}; for (const w of mine) byType[w.type] = (byType[w.type] || 0) + +w.duration_min;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]), tmax = types[0]?.[1] || 1;
  const best = f => mine.reduce((a, w) => f(w) > f(a) ? w : a);
  const pbRun = k => { const r = mine.filter(w => w.type === 'run' && +w.distance_km >= k); if (!r.length) return null;
    return pace(r.reduce((a, w) => w.duration_min / w.distance_km < a.duration_min / a.distance_km ? w : a))[1]; };
  const gearKm = id => mine.filter(w => w.gear_id === id).reduce((a, w) => a + +w.distance_km, 0);
  const goal = me.weekly_goal_min;
  const monthTop = Object.entries(in_(mo, Infinity).reduce((a, w) => (a[w.type] = (a[w.type] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1])[0];
  const pbs = mine.length ? [
    ['5K 최고 페이스', pbRun(5)], ['10K 최고 페이스', pbRun(10)], ['하프 최고 페이스', pbRun(21.0975)],
    ...(b => +b.distance_km ? [[`최장 거리 · ${typeOf(b.type).label}`, fmtNum(b.distance_km, 2) + ' km']] : [])(best(w => +w.distance_km)),
    ...(b => [[`최장 시간 · ${typeOf(b.type).label}`, fmtDur(b.duration_min)]])(best(w => +w.duration_min)),
    ...(b => [[`최대 칼로리 · ${typeOf(b.type).label}`, fmtNum(b.kcal) + ' kcal']])(best(w => +w.kcal)),
    ...(b => b.avg_hr ? [['최고 상대적 노력', String(effort(b))]] : [])(best(effort)),
  ].filter(x => x[1]) : [];

  v.innerHTML = meHead(`${mine.length}번 운동 · 크루 ${S.crews.length}개`) + `
    ${goal ? `<section class="goal"><div><span>이번 주 목표</span><b class="num">${Math.round(tw.minutes)} / ${goal}분</b></div><div class="bar"><i style="width:${Math.min(100, tw.minutes / goal * 100)}%"></i></div></section>` : ''}
    <div class="tiles">
      <div class="tile"><small>이번 주 운동</small><b>${fmtDur(tw.minutes)}</b>${diff(tw.minutes, lw.minutes, fmtDur)}</div>
      <div class="tile"><small>이번 주 칼로리</small><b>${fmtNum(tw.kcal)}<small> kcal</small></b>${diff(tw.kcal, lw.kcal, x => fmtNum(x) + ' kcal')}</div>
      <div class="tile"><small>주간 스트릭</small><b>${st.weekly}<small>주</small></b><em>매주 1회 이상 운동</em></div>
      <div class="tile"><small>연속 운동</small><b>${st.daily}<small>일</small></b><em>최장 ${st.best}일</em></div>
    </div>
    <section class="recap">
      <span>${new Date().getMonth() + 1}월 결산</span>
      <b>${tm.count}번 · ${fmtDur(tm.minutes)} · ${fmtNum(tm.kcal)} kcal</b>
      <p>${tm.distance ? `${fmtNum(tm.distance, 1)} km 이동 · ` : ''}${monthTop ? `제일 많이 한 운동 ${typeOf(monthTop[0]).label} ${monthTop[1]}회` : '이번 달은 아직 기록이 없어요'}</p>
      <button class="btn taunt" data-act="recap">${ic('camera')}결산 카드 만들기</button>
    </section>
    <h3 class="sec">최근 12주 운동시간</h3>
    <div class="chart" role="img" aria-label="최근 12주 주간 운동시간 막대그래프">${weeks.map((w, i) => `<div><span>${w.v ? Math.round(w.v) : ''}</span><i style="height:${w.v / wmax * 100}%"></i><small>${i % 3 === 2 || i === 11 ? (new Date(w.s).getMonth() + 1) + '/' + new Date(w.s).getDate() : ''}</small></div>`).join('')}</div>
    <p class="hint">막대 위 숫자는 분, 아래는 그 주 월요일.</p>
    <h3 class="sec">내 기록 찾기</h3>
    <label class="search">${ic('search')}<input type="search" id="me-search" placeholder="10/13, 테니스, 한강" aria-label="날짜, 종목, 제목이나 메모로 내 기록 검색" value="${esc(S.q)}" autocomplete="off"></label>
    <div class="results" id="me-results">${searchResults()}</div>
    <div class="calhead"><h3 class="sec">${cm.getFullYear()}년 ${cm.getMonth() + 1}월</h3><div><button class="icbtn" data-act="cal" data-d="-1" aria-label="이전 달">${ic('chevron-left')}</button><button class="icbtn" data-act="cal" data-d="1" aria-label="다음 달">${ic('chevron-right')}</button></div></div>
    <div class="cal">${['월', '화', '수', '목', '금', '토', '일'].map(d => `<span class="h">${d}</span>`).join('')}${cells}</div>
    ${types.length ? `<h3 class="sec">종목별 비중</h3><div class="typebars">${types.map(([k, val]) => `<div class="tb"><span>${ic(typeOf(k).icon)}${esc(typeOf(k).label)}</span><div class="bar"><i style="width:${val / tmax * 100}%"></i></div><span class="val">${fmtDur(val)}</span></div>`).join('')}</div>` : ''}
    ${pbs.length ? `<h3 class="sec">개인 최고 기록</h3><dl class="pbs">${pbs.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>` : ''}
    <h3 class="sec">배지</h3>
    <div class="badges">${badges(mine, st).map(([i, l, on]) => `<div class="badge ${on ? 'on' : ''}"><span>${ic(i)}</span>${l}</div>`).join('')}</div>
    <h3 class="sec">내 장비</h3>
    ${S.gear.map(g => { const km = gearKm(g.id), over = g.retire_km && km >= g.retire_km; return `<div class="gear">
      <span class="ticon">${ic(g.kind === 'bike' ? 'bike' : g.kind === 'shoes' ? 'shoe' : 'activity')}</span>
      <div><b>${esc(g.name)}</b>${g.retired ? '<span class="tag">은퇴</span>' : ''}<span class="num">${fmtNum(km, 1)}${g.retire_km ? ' / ' + fmtNum(g.retire_km) : ''} km</span>
        ${g.retire_km ? `<div class="bar ${over ? 'over' : ''}"><i style="width:${Math.min(100, km / g.retire_km * 100)}%"></i></div>` : ''}
        ${over && !g.retired ? '<p class="warn">교체할 때가 됐어요</p>' : ''}</div>
      <button class="linkbtn" data-act="retire" data-id="${g.id}">${g.retired ? '다시 사용' : '은퇴'}</button></div>`; }).join('') || '<p class="hint">신발이나 자전거를 등록하면 누적 거리가 쌓여요.</p>'}
    <details class="panel"><summary>장비 추가</summary>
      <form class="stack" data-form="gear"><div class="row">
        <label class="field"><span>이름</span><input type="text" name="name" maxlength="40" placeholder="페가수스 41"></label>
        <label class="field"><span>종류</span><select name="kind"><option value="shoes">신발</option><option value="bike">자전거</option><option value="etc">기타</option></select></label>
        <label class="field"><span>교체 알림 (km)</span><input type="number" name="km" min="1" inputmode="numeric" placeholder="700"></label>
      </div><button class="btn">추가</button></form></details>
    <button class="btn wide" data-act="feedback">${ic('bulb')}건의·버그 제보</button>
    <details class="panel"><summary>설정</summary>
      <div class="avatar-row">${avatar(S.uid, 'lg')}
        <label class="btn">${ic('camera')}사진 바꾸기<input type="file" id="avatar-file" accept="image/*" hidden></label>
        ${me.avatar_url ? '<button class="btn" data-act="avatar-del">사진 빼기</button>' : ''}</div>
      <form class="stack" data-form="settings"><div class="row">
        <label class="field"><span>닉네임</span><input type="text" name="nick" maxlength="20" value="${esc(me.nickname)}"></label>
        <label class="field"><span>주간 목표 (분)</span><input type="number" name="goal" min="0" max="5000" value="${me.weekly_goal_min}"></label>
      </div><button class="btn">저장</button></form>
      <p class="hint">닉네임과 주간 목표는 크루원에게 보여요. 키·체중 같은 신체 정보는 내 몸 탭에 따로 저장돼요.</p>
      <button class="btn wide danger" data-act="logout">${ic('logout')}로그아웃</button></details>`;
}

// 프로필 사진: 가운데 정사각형 160px(약 7KB)로 줄여 <내 id>/avatar-시각.jpg 에 저장, 예전 파일은 지움
async function setAvatar(path) {
  const old = S.me.avatar_url;
  S.me = ok(await sb.from('profiles').update({ avatar_url: path }).eq('id', S.uid).select().single()); S.people[S.uid] = S.me;
  if (old) await sb.storage.from('photos').remove([old]);
  await signAvatars(); return refresh();
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'avatar-file' || !e.target.files[0]) return;
  const file = e.target.files[0]; e.target.value = '';
  try {
    const blob = await compress(file, 160, true), path = `${S.uid}/avatar-${Date.now()}.jpg`;
    ok(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '604800' }));
    await setAvatar(path); toast('프로필 사진을 바꿨어요');
  } catch (err) { fail(err, '사진을 올리지 못했어요. 다른 사진으로 해 보세요.'); }
});

export const actions = {
  'avatar-del': async () => { await setAvatar(null); toast('프로필 사진을 뺐어요'); },
  cal: b => { S.calMonth.setMonth(S.calMonth.getMonth() + +b.dataset.d); return refresh(); },
  day: b => {
    const ws = S.mine.filter(w => dayKey(w.started_at) === b.dataset.day);
    if (ws.length === 1) return goToWorkout(ws[0].id);
    S.qDay = b.dataset.day; $('#me-results').innerHTML = searchResults(); $('#me-results').scrollIntoView({ block: 'center' });
  },
  'clear-q': () => { S.qDay = null; $('#me-results').innerHTML = searchResults(); },
  retire: async b => {
    const g = S.gear.find(x => x.id === b.dataset.id);
    ok(await sb.from('gear').update({ retired: !g.retired }).eq('id', g.id)); g.retired = !g.retired; initGearSelect(); return refresh();
  },
  recap: () => shareRecap(),
  logout: async () => { await sb.auth.signOut(); location.reload(); },
};

export const forms = {
  gear: async (f, d) => {
    if (!d.name) return toast('장비 이름을 입력해 주세요.');
    ok(await sb.from('gear').insert({ name: d.name, kind: d.kind, retire_km: +d.km || null }));
    await loadGear(); initGearSelect(); return refresh();
  },
  settings: async (f, d) => {
    S.me = ok(await sb.from('profiles').update({ nickname: d.nick || S.me.nickname, weekly_goal_min: +d.goal || 0 }).eq('id', S.uid).select().single());
    S.people[S.uid] = S.me; toast('저장했어요'); return refresh();
  },
};

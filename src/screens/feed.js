// 피드: 크루 기록 카드, 라이벌 현황, 약올림 목록
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, fmtNum, fmtClock, fmtDist, fmtDate, fmtTime, ago, startOf, pick, toast } from '../lib/util.js';
import { typeOf, REACTS, POKES, points, METRIC } from '../lib/types.js';
import { sum, pace, effort, nameOf, crew, avatar } from '../lib/calc.js';
import { loadFeed, loadMine, crewTotals } from '../lib/data.js';
import { show } from '../nav.js';
import { editWorkout } from './log.js';
import { shareWorkout } from './share.js';

// "8.42 km" → 숫자는 크게, 단위는 작게
const big = v => esc(v).replace(/ ([^\d\s]+)$/, ' <small>$1</small>');

// 반응한 사람: 겹친 사진 3개 + "민수 외 2명이 반응했어요" → 누르면 누가 무슨 반응을 했는지 목록
function rxWho(w) {
  const rs = w.reactions.filter(r => !S.blocked.includes(r.user_id)); if (!rs.length) return '';
  const first = rs.find(r => r.user_id !== S.uid) || rs[0], n = rs.length;
  const text = n > 1 ? `${esc(nameOf(first.user_id))} 외 ${n - 1}명이 반응했어요` : first.user_id === S.uid ? '내가 반응했어요' : `${esc(nameOf(first.user_id))}님이 반응했어요`;
  return `<button type="button" class="rx-who" data-act="rx-who"><span class="faces">${rs.slice(0, 3).map(r => avatar(r.user_id, 'xs')).join('')}</span>${text}</button>`;
}

export function card(w) {
  const t = typeOf(w.type), mine = w.user_id === S.uid, hide = mine ? [] : (w.hide_stats || []);
  const all = [];
  if (+w.distance_km) all.push(['거리', fmtDist(w)]);
  const pc = pace(w); if (pc && !hide.includes('pace')) all.push(pc);
  all.push(['시간', fmtClock(w.duration_min)]);
  if (!hide.includes('kcal')) all.push(['칼로리', fmtNum(w.kcal) + ' kcal']);
  all.push(['갓생 포인트', fmtNum(points(w)) + ' P']);
  if (+w.elev_m) all.push(['상승고도', fmtNum(w.elev_m) + ' m']);
  if (w.avg_hr && !hide.includes('hr')) all.push(['평균심박', w.avg_hr + ' bpm'], ['상대적 노력', String(effort(w))]);
  if (w.rpe) all.push(['체감강도', w.rpe + '/10']);
  const main = all.slice(0, 3), rest = all.slice(3);

  const myRx = w.reactions.find(r => r.user_id === S.uid)?.kind;
  const gear = mine && S.gear.find(g => g.id === w.gear_id);
  const tags = [
    w.visibility === 'private' ? `<span class="tag">${ic('lock')}나만 보기</span>` : '',
    w.tags?.includes('commute') ? '<span class="tag">출퇴근</span>' : '',
    gear ? `<span class="tag">${ic('shoe')}${esc(gear.name)}</span>` : '',
    mine && w.hide_stats?.length ? `<span class="tag">${ic('eye-off')}일부 항목 크루에 숨김</span>` : '',
  ].join('');
  const cms = (w.comments || []).filter(c => !S.blocked.includes(c.user_id)), open = w._open || cms.length <= 2, shown = open ? cms : cms.slice(-2);

  return `<article class="card" data-wid="${w.id}">
    <header class="who">${avatar(w.user_id)}
      <div class="who-t"><button type="button" class="who-nm" data-act="profile" data-id="${w.user_id}">${esc(nameOf(w.user_id))}</button><span>${ic(t.icon)}${esc(t.label)} · ${fmtDate(w.started_at)} ${fmtTime(w.started_at)}</span></div>
      ${mine ? `<button class="icbtn" data-act="share" aria-label="공유 카드 만들기">${ic('share-2')}</button><button class="icbtn" data-act="edit" aria-label="기록 수정">${ic('pencil')}</button><button class="icbtn" data-act="del" aria-label="기록 삭제">${ic('trash')}</button>`
        : `<button class="icbtn" data-act="report" aria-label="기록 신고">${ic('flag')}</button>`}
    </header>
    ${w.title ? `<h3 class="title">${esc(w.title)}</h3>` : ''}
    ${w.memo ? (w._memo ? `<p class="memo">${esc(w.memo)}</p>` : `<p class="memo clamp">${esc(w.memo)}</p><button type="button" class="linkbtn more" data-act="memo-more" hidden>더보기</button>`) : ''}
    <dl class="stats">${main.map(([k, v]) => `<div><dt>${k}</dt><dd>${big(v)}</dd></div>`).join('')}</dl>
    ${rest.length ? `<dl class="sub">${rest.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    ${w.brag ? `<p class="brag">${esc(w.brag)}</p>` : ''}
    ${w.photos?.length ? `<div class="photos ${w.photos.length > 1 ? 'multi' : ''}">${w.photos.map((p, i) => `<img alt="${esc(nameOf(w.user_id))}의 운동 사진 ${i + 1}" src="${esc(S.urls[p] || '')}" loading="lazy">`).join('')}</div>` : ''}
    ${mine && S.notes[w.id] ? `<p class="note">${ic('lock')}${esc(S.notes[w.id])}</p>` : ''}
    <div class="actbar">
      ${Object.entries(REACTS).map(([k, [emoji, label]]) => {
        const n = w.reactions.filter(r => r.kind === k).length;
        return `<button class="rx" data-act="react" data-k="${k}" aria-pressed="${myRx === k}" ${mine ? 'disabled' : ''} aria-label="${label}${n ? ' ' + n : ''}"><i aria-hidden="true">${emoji}</i><span>${label}</span>${n ? `<b>${n}</b>` : ''}</button>`;
      }).join('')}
    </div>
    ${rxWho(w)}
    <div class="comments">
      ${!open ? `<button class="linkbtn" data-act="more-cm">댓글 ${cms.length}개 모두 보기</button>` : ''}
      ${shown.map(c => `<div class="cm">${avatar(c.user_id, 'sm')}<p><b>${esc(nameOf(c.user_id))}</b>${esc(c.body)}<small>${ago(c.created_at)}</small></p>
        ${c.user_id !== S.uid ? `<button class="icbtn sm" data-act="report-cm" data-cid="${c.id}" aria-label="댓글 신고">${ic('flag')}</button>` : ''}
        ${c.user_id === S.uid || mine ? `<button class="icbtn sm" data-act="del-cm" data-cid="${c.id}" aria-label="댓글 삭제">${ic('x')}</button>` : ''}</div>`).join('')}
      <form class="cform" data-form="comment"><input type="text" maxlength="300" placeholder="댓글 달기" aria-label="댓글"><button aria-label="댓글 등록">${ic('message-circle')}</button></form>
    </div>
  </article>`;
}

export async function renderFeed() {
  const head = [];
  if (S.crewId) {
    const by = await crewTotals(startOf('week'));
    const board = Object.entries(by).map(([id, l]) => [id, sum(l).points]).sort((a, b) => b[1] - a[1]);
    const i = board.findIndex(([id]) => id === S.uid);
    if (board.length > 1 && i >= 0) {
      const mine = board[i][1], P = METRIC.points.fmt;
      head.push(`<section class="rival">
        <div><span>${esc(crew().name)} · 이번 주 ${i + 1}위 / ${board.length}명</span><b>${P(mine)}</b></div>
        <em>${i === 0 ? `2위보다 ${P(mine - board[1][1])} 앞섬` : `${esc(nameOf(board[i - 1][0]))}까지 ${P(board[i - 1][1] - mine)}`}</em>
      </section>`);
    }
    const pokes = ok(await sb.from('pokes').select('*').eq('crew_id', S.crewId).order('created_at', { ascending: false }).limit(10))
      .filter(p => !S.blocked.includes(p.from_id) && !S.blocked.includes(p.to_id)).slice(0, 5);
    if (pokes.length) head.push(`<section class="ticker" aria-label="최근 약올리기">${pokes.map(p => `<p class="${p.to_id === S.uid ? 'mine' : ''}"><span>${esc(nameOf(p.from_id))} → ${esc(nameOf(p.to_id))}</span><mark>${esc(p.text)}</mark><small>${ago(p.created_at)}</small></p>`).join('')}</section>`);
  }
  const wk = sum(S.mine.filter(w => new Date(w.started_at) >= startOf('week'))).minutes, goal = S.me.weekly_goal_min;
  if (goal) head.push(`<section class="goal"><div><span>이번 주 목표</span><b class="num">${Math.round(wk)} / ${goal}분</b></div><div class="bar"><i style="width:${Math.min(100, wk / goal * 100)}%"></i></div></section>`);

  const list = S.feed.filter(w => !S.blocked.includes(w.user_id));
  $('#v-feed').innerHTML = `<div class="feed-head">${head.join('')}</div>` + (list.length
    ? list.map(card).join('') + (S.feedEnd ? '<p class="end">여기까지예요</p>' : '<button class="btn ghost wide" data-act="more-feed">더 보기</button>')
    : `<div class="empty">${ic(S.crews.length ? 'run' : 'users', 'big')}<b>${S.crews.length ? '아직 아무도 운동 안 함' : '먼저 크루에 들어가세요'}</b>
      <p>${S.crews.length ? '지금 기록하면 자동으로 1등이에요.' : '크루를 만들거나 초대코드로 들어가면 친구들 기록이 여기 떠요.'}</p>
      <button class="btn primary" data-act="go" data-tab="${S.crews.length ? 'log' : 'crew'}">${S.crews.length ? '첫 기록 올리기' : '크루로 가기'}</button></div>`);
}

// 피드에서 해당 기록으로 이동 (아직 안 불러온 기록이면 페이지를 더 불러옴)
export async function goToWorkout(id) {
  toast('기록 찾는 중…');
  for (let i = 0; i < 50 && !S.feed.some(w => w.id === id) && !S.feedEnd; i++) await loadFeed();
  if (!S.feed.some(w => w.id === id)) return toast('피드에서 이 기록을 찾지 못했어요.');
  show('feed', true); await renderFeed();
  const el = document.querySelector(`[data-wid="${id}"]`);
  el.scrollIntoView({ block: 'start' }); el.classList.add('flash');
  setTimeout(() => el.scrollIntoView({ block: 'start' }), 500); // 위쪽 사진 로딩으로 밀린 경우 재정렬
  setTimeout(() => el.classList.remove('flash'), 2500);
}

// 메모는 3줄까지 접어 두고, 실제로 넘칠 때만 '더보기'를 보여 줌(피드·프로필·검색 어디서 그려도)
new MutationObserver(() => document.querySelectorAll('.memo.clamp:not([data-m])').forEach(p => {
  if (!p.clientHeight) return;   // 숨은 화면이면 보일 때 다시 잼
  p.dataset.m = 1; p.nextElementSibling.hidden = p.scrollHeight <= p.clientHeight + 1;
})).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

export const actions = {
  'rx-who': (b, w) => {
    const rs = w.reactions.filter(r => !S.blocked.includes(r.user_id));
    $('#rx-list').innerHTML = Object.keys(REACTS).flatMap(k => rs.filter(r => r.kind === k)).map(r =>
      `<div class="frow"><button type="button" class="nm" data-act="profile" data-id="${r.user_id}">${avatar(r.user_id, 'sm')}<span>${esc(nameOf(r.user_id))}</span></button><span class="rx-tag">${REACTS[r.kind][0]} ${REACTS[r.kind][1]}</span></div>`).join('');
    $('#rx-dlg').showModal();
  },
  'close-rx': () => $('#rx-dlg').close(),
  'memo-more': (b, w) => { if (w) w._memo = true; b.previousElementSibling.classList.remove('clamp'); b.remove(); },
  'more-feed': async b => { b.disabled = true; await loadFeed(); return renderFeed(); },
  'more-cm': (b, w) => { w._open = true; return renderFeed(); },
  react: async (b, w) => {
    const cur = w.reactions.find(r => r.user_id === S.uid);
    if (cur?.kind === b.dataset.k) {
      ok(await sb.from('reactions').delete().eq('workout_id', w.id).eq('user_id', S.uid));
      w.reactions = w.reactions.filter(r => r !== cur);
    } else {
      ok(await sb.from('reactions').upsert({ workout_id: w.id, user_id: S.uid, kind: b.dataset.k }));
      w.reactions = [...w.reactions.filter(r => r.user_id !== S.uid), { user_id: S.uid, kind: b.dataset.k }];
    }
    return renderFeed();
  },
  'del-cm': async (b, w) => {
    ok(await sb.from('comments').delete().eq('id', b.dataset.cid));
    w.comments = w.comments.filter(c => c.id !== b.dataset.cid);
    return renderFeed();
  },
  del: async (b, w) => {
    if (!confirm('이 기록을 삭제할까요? 사진·댓글도 함께 지워져요.')) return;
    ok(await sb.from('workouts').delete().eq('id', w.id));
    if (w.photos.length) await sb.storage.from('photos').remove(w.photos);
    S.feed = S.feed.filter(x => x !== w); await loadMine();
    toast('삭제했어요'); return renderFeed();
  },
  edit: (b, w) => editWorkout(w),
  share: (b, w) => shareWorkout(w),
  poke: async b => {
    b.disabled = true;
    ok(await sb.from('pokes').insert({ to_id: b.dataset.to, crew_id: b.dataset.crew || S.crewId, text: pick(POKES) }));
    toast(`${nameOf(b.dataset.to)} 약올림 완료 😏`);
  },
  goto: b => goToWorkout(b.dataset.id),
};

export const forms = {
  comment: async f => {
    const body = f.querySelector('input').value.trim(); if (!body) return;
    const wid = f.closest('[data-wid]').dataset.wid, w = [S.feed, S.ppList, S.searchList].flatMap(l => l || []).find(x => x.id === wid);
    const c = ok(await sb.from('comments').insert({ workout_id: w.id, body }).select().single());
    w.comments.push(c); w._open = true; return renderFeed();
  },
};

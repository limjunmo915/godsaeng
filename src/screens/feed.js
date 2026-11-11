// 피드: 크루 기록 카드, 라이벌 현황, 약올림 목록
import { S, sb, ok, $ } from '../state.js';
import { ic, rxImg, kkRx, kkTease, STICKERS, stickerOf, kkEmpty } from '../lib/icons.js';
import { esc, fmtNum, fmtClock, fmtDist, fmtDate, fmtTime, ago, startOf, pick, toast, pop, lsGet, lsSet } from '../lib/util.js';
import { typeOf, REACTS, POKES, points, METRIC } from '../lib/types.js';
import { sum, pace, effort, nameOf, crew, avatar } from '../lib/calc.js';
import { loadFeed, loadMine, crewTotals } from '../lib/data.js';
import { routeSvg } from '../lib/gps.js';
import { show } from '../nav.js';
import { editWorkout } from './log.js';
import { shareWorkout } from './share.js';
import { tgLine } from './together.js';

// "8.42 km" → 숫자는 크게, 단위는 작게
const big = v => esc(v).replace(/ ([^\d\s]+)$/, ' <small>$1</small>');

// 반응한 사람: 각자 누른 깐족이 스티커를 최대 5개 겹쳐서 + "민수, 지은, 나 외 4명이 반응했어요" → 누르면 다시 '뿅' + 누가 무슨 반응을 했는지 목록
function rxSummary(w) {
  const rs = w.reactions.filter(r => !S.blocked.includes(r.user_id)); if (!rs.length) return null;
  const order = [...rs.filter(r => r.user_id === S.uid), ...rs.filter(r => r.user_id !== S.uid)];   // 나는 맨 앞
  const names = order.slice(0, 3).map(r => r.user_id === S.uid ? '나' : nameOf(r.user_id) + '님'), more = rs.length - names.length;
  const text = names.length === 1 && order[0].user_id === S.uid ? '내가 반응했어요' : `${names.join(', ')}${more > 0 ? ` 외 ${more}명이` : '이'} 반응했어요`;
  return { rs, top: order.slice(0, 5), text };
}
function rxWho(w) {
  const x = rxSummary(w); if (!x) return '';
  return `<button type="button" class="rx-who" data-act="rx-who"><span class="rx-stack">${x.top.map(r => `<img src="${kkRx(r.kind)}" alt="">`).join('')}</span>${esc(x.text)}</button>`;
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
  const rt = S.routes?.[w.id];   // 저장된 경로(출발·도착 200m 잘린 것): 사진보다 앞, 첫 장
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
    ${tgLine(w)}
    ${w.brag ? `<p class="brag">${esc(w.brag)}</p>` : ''}
    ${rt || w.photos?.length ? `<div class="photos ${(rt ? 1 : 0) + w.photos.length > 1 ? 'multi' : ''}">${rt ? `<button type="button" class="route-slide" data-act="route-map" aria-label="경로 지도로 보기">${routeSvg(rt, 400, 500, 36)}<span>${ic('route')}지도로 보기</span></button>` : ''}${w.photos.map((p, i) => `<img alt="${esc(nameOf(w.user_id))}의 운동 사진 ${i + 1}" src="${esc(S.urls[p] || '')}" loading="lazy">`).join('')}</div>` : ''}
    ${mine && S.notes[w.id] ? `<p class="note">${ic('lock')}${esc(S.notes[w.id])}</p>` : ''}
    <div class="actbar">
      ${Object.entries(REACTS).map(([k, [, label]]) => {
        const n = w.reactions.filter(r => r.kind === k).length;
        return `<button class="rx" data-act="react" data-k="${k}" aria-pressed="${myRx === k}" aria-label="${label}${n ? ' ' + n : ''}">${rxImg(k)}<span>${label}</span>${n ? `<b>${n}</b>` : ''}</button>`;
      }).join('')}
    </div>
    ${rxWho(w)}
    <div class="comments">
      ${!open ? `<button class="linkbtn" data-act="more-cm">댓글 ${cms.length}개 모두 보기</button>` : ''}
      ${shown.map(c => `<div class="cm">${avatar(c.user_id, 'sm')}<p><b>${esc(nameOf(c.user_id))}</b>${stickerOf(c.body) ? `<img class="cm-sticker" src="img/kk/${stickerOf(c.body)}.webp" alt="깐족이 스티커">` : esc(c.body)}<small>${ago(c.created_at)}</small></p>
        ${S.cl?.[c.id] ? `<button class="cm-like" data-act="cm-like" data-cid="${c.id}" aria-pressed="${S.cl[c.id].includes(S.uid)}" aria-label="댓글 하트">${ic('heart')}<span>${S.cl[c.id].length || ''}</span></button>` : ''}
        ${c.user_id !== S.uid ? `<button class="icbtn sm" data-act="report-cm" data-cid="${c.id}" aria-label="댓글 신고">${ic('flag')}</button>` : ''}
        ${c.user_id === S.uid || mine ? `<button class="icbtn sm" data-act="del-cm" data-cid="${c.id}" aria-label="댓글 삭제">${ic('x')}</button>` : ''}</div>`).join('')}
      <form class="cform" data-form="comment"><button type="button" class="stk-btn" data-act="stk" aria-label="깐족이 스티커">${ic('mood-smile')}</button><input type="text" maxlength="300" placeholder="댓글 달기" aria-label="댓글"><button aria-label="댓글 등록">${ic('message-circle')}</button></form>
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
      head.push(`<section class="rival" data-act="go" data-tab="rank" role="button" tabindex="0" aria-label="크루 랭킹 보기">
        <div><span>${esc(crew().name)} · 이번 주 ${i + 1}위 / ${board.length}명</span><b>${P(mine)}</b></div>
        <em>${i === 0 ? `2위보다 ${P(mine - board[1][1])} 앞섬` : `${esc(nameOf(board[i - 1][0]))}까지 ${P(board[i - 1][1] - mine)}`}</em>
      </section>`);
    }
    // 나를 약올린 것만(내가 한 것·남끼리 한 것은 안 보임)
    const pokes = ok(await sb.from('pokes').select('*').eq('to_id', S.uid).order('created_at', { ascending: false }).limit(10))
      .filter(p => !S.blocked.includes(p.from_id)).slice(0, 5);
    if (pokes.length) head.push(`<section class="ticker" aria-label="나를 약올린 사람">${pokes.map(p => `<p class="mine"><span>${esc(nameOf(p.from_id))}</span><mark>${esc(p.text)}</mark><small>${ago(p.created_at)}</small></p>`).join('')}</section>`);
  }
  const wk = sum(S.mine.filter(w => new Date(w.started_at) >= startOf('week'))).minutes, goal = S.me.weekly_goal_min;
  if (goal) head.push(`<section class="goal"><div><span>이번 주 목표</span><b class="num">${Math.round(wk)} / ${goal}분</b></div><div class="bar"><i style="width:${Math.min(100, wk / goal * 100)}%"></i></div></section>`);

  const list = S.feed.filter(w => !S.blocked.includes(w.user_id));
  $('#v-feed').innerHTML = `<div class="feed-head">${head.join('')}</div>` + (list.length
    ? list.map(card).join('') + (S.feedEnd ? '<p class="end">여기까지예요</p>' : '<button class="btn ghost wide" data-act="more-feed">더 보기</button>')
    : `<div class="empty"><img class="kk-big" src="img/kk/${S.crews.length ? 'empty-feed' : 'empty-crew'}.webp" alt=""><b>${S.crews.length ? '아직 아무도 운동 안 함' : '먼저 크루에 들어가세요'}</b>
      <p>${S.crews.length ? '지금 기록하면 자동으로 1등이에요.' : '크루를 만들거나 초대코드로 들어가면 친구들 기록이 여기 떠요.'}</p>
      <button class="btn primary" data-act="go" data-tab="${S.crews.length ? 'log' : 'crew'}">${S.crews.length ? '첫 기록 올리기' : '크루로 가기'}</button></div>`);
  markPoked(list).catch(console.error); markMyRx(list);
  // 끝까지 내리면 다음 글을 알아서 불러옴('더 보기'를 안 눌러도)
  const more = $('#v-feed [data-act="more-feed"]'); moreObs?.disconnect();
  if (more) { moreObs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { moreObs.disconnect(); more.click(); } }, { rootMargin: '600px' }); moreObs.observe(more); }
}
let moreObs;
// 남이 올린 새 글 받기: 앱으로 돌아왔을 때(1분 넘게 지났고 맨 위 근처를 보고 있을 때)·피드 탭을 한 번 더 누를 때(force)
export async function freshen(force) {
  if (!force && (Date.now() - (S.feedAt || 0) < 60000 || scrollY > 300)) return;
  if (S.tab !== 'feed' || document.querySelector('dialog[open], .pp:not([hidden])') || document.activeElement?.closest('.cform')) return;   // 뭔가 하는 중이면 그대로
  await Promise.all([loadFeed(true), loadMine()]); return renderFeed();
}

// 내 글이 화면에 들어오면 지난번 본 뒤 새로 받은 반응을 깐족이로(글마다 이 폰에서 한 번). 처음엔 지금 반응을 다 본 걸로 침
const rxKey = r => `${r.user_id}:${r.kind}`;
export function markRxSeen(wid, keys) {
  const m = JSON.parse(lsGet('rxSeen') || '{}'); m[wid] = [...new Set([...(m[wid] || []), ...keys])]; lsSet('rxSeen', JSON.stringify(m));
}
let rxObs, popUntil = 0, mapFull = null;
// 깐족이가 떠 있거나 창(반응 목록 등)이 열려 있으면 다른 글 깐족이는 기다림
const busy = () => Date.now() < popUntil || !!document.querySelector('dialog[open]');
function markMyRx(list) {
  const mine = list.filter(w => w.user_id === S.uid);
  if (!lsGet('rxSeen')) lsSet('rxSeen', JSON.stringify(Object.fromEntries(mine.map(w => [w.id, w.reactions.map(rxKey)]))));
  const fresh = w => { const seen = JSON.parse(lsGet('rxSeen'))[w.id] || []; return w.reactions.filter(r => r.user_id !== S.uid && !S.blocked.includes(r.user_id) && !seen.includes(rxKey(r))); };
  const todo = new Set(mine.filter(w => fresh(w).length).map(w => w.id));
  rxObs?.disconnect(); if (!todo.size) return;
  rxObs = new IntersectionObserver(es => es.forEach(e => {
    const w = S.feed.find(x => x.id === e.target.dataset.wid);
    if (!e.isIntersecting || !w || !todo.has(w.id) || busy()) return;   // 한 번에 하나만, 창이 열려 있으면 다음에
    const nw = fresh(w); todo.delete(w.id); rxObs.unobserve(e.target); markRxSeen(w.id, w.reactions.map(rxKey));
    if (!nw.length) return;
    popUntil = Date.now() + 2600;
    const names = nw.slice(0, 2).map(r => nameOf(r.user_id) + '님');
    pop(kkRx(nw[0].kind), e.target.querySelector('.photos') || e.target, `${names.join(', ')}${nw.length > 2 ? ` 외 ${nw.length - 2}명이` : '이'} 반응했어요`);
  }), { threshold: 0.6 });
  document.querySelectorAll('#v-feed .card[data-wid]').forEach(c => { if (todo.has(c.dataset.wid)) rxObs.observe(c); });
}

// 24시간 안에 약올림 당한 크루원·친구의 글이 화면에 들어오면 깐족이 뿅(SQL 013). 약올림 하나당 이 폰에서 한 번만, 누가 했는지는 안 보임
let poked = { at: 0, rows: [] }, pokeObs;
async function markPoked(list) {
  const ids = [...new Set(list.map(w => w.user_id))].filter(id => id !== S.uid);
  if (Date.now() - poked.at > 60000 && ids.length) {
    const { data, error } = await sb.rpc('recent_poked', { ids });
    poked = { at: Date.now(), rows: error ? [] : data };   // SQL 013 실행 전이면 조용히 넘어감
  }
  const seen = JSON.parse(lsGet('pokeSeen') || '[]');
  const todo = new Map(poked.rows.filter(p => !seen.includes(p.poke_id)).map(p => [p.user_id, p.poke_id]));
  pokeObs?.disconnect(); if (!todo.size) return;
  pokeObs = new IntersectionObserver(es => es.forEach(e => {
    const w = S.feed.find(x => x.id === e.target.dataset.wid), pid = w && todo.get(w.user_id);
    if (!e.isIntersecting || !pid || busy()) return;
    todo.delete(w.user_id); lsSet('pokeSeen', JSON.stringify([...seen, pid].slice(-100))); seen.push(pid);
    popUntil = Date.now() + 2600;
    pop(kkTease(), e.target.querySelector('.photos') || e.target, `${nameOf(w.user_id)}님 약올림 당하는 중`);
  }), { threshold: 0.6 });
  document.querySelectorAll('#v-feed .card[data-wid]').forEach(c => { const w = S.feed.find(x => x.id === c.dataset.wid); if (w && todo.has(w.user_id)) pokeObs.observe(c); });
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
  // 경로 그림을 누르면 전체 화면 지도(이때만 지도 그림을 불러와서 무료 한도 안)
  'route-map': async (b, w) => {
    const pts = S.routes[w.id]; $('#map-dlg').showModal();
    const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
    mapFull?.remove();
    mapFull = L.map('map-full', { zoomControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapFull);
    const line = L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#141A0B', weight: 5, opacity: 0.9 }).addTo(mapFull);
    mapFull.fitBounds(line.getBounds(), { padding: [24, 24] });
  },
  'map-close': () => { $('#map-dlg').close(); mapFull?.remove(); mapFull = null; },
  'rx-who': (b, w) => {
    const { rs, top, text } = rxSummary(w);
    $('#rx-list').innerHTML = Object.keys(REACTS).flatMap(k => rs.filter(r => r.kind === k)).map(r =>
      `<div class="frow"><button type="button" class="nm" data-act="profile" data-id="${r.user_id}">${avatar(r.user_id, 'sm')}<span>${esc(nameOf(r.user_id))}</span></button><span class="rx-tag">${rxImg(r.kind)}${REACTS[r.kind][1]}</span></div>`).join('');
    $('#rx-dlg').showModal();
    popUntil = Date.now() + 2600;   // 다시 보기 동안 다른 글 깐족이는 안 띄움
    const c = b.closest('.card'); pop(top.map(r => kkRx(r.kind)), c?.querySelector('.photos') || c, text);   // 목록 창 위로 이 글 반응만 다시 한 번
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
      const c = b.closest('.card'); pop(kkRx(b.dataset.k), c?.querySelector('.photos') || c);
      w.reactions = [...w.reactions.filter(r => r.user_id !== S.uid), { user_id: S.uid, kind: b.dataset.k }];
    }
    return renderFeed();
  },
  // 스티커 고르는 칸: 처음 누를 때만 그림을 채움(카드마다 미리 그리면 무거움)
  stk: b => {
    const f = b.closest('.cform'); let pk = f.nextElementSibling;
    if (!pk?.classList.contains('stk-pick')) {
      f.insertAdjacentHTML('afterend', `<div class="stk-pick">${STICKERS.map(s => `<button type="button" data-act="stk-send" data-s="${s}" aria-label="스티커 보내기"><img src="img/kk/${s}.webp" alt="" loading="lazy"></button>`).join('')}</div>`);
    } else pk.hidden = !pk.hidden;
  },
  'stk-send': (b, w) => { const c = b.closest('.card'); pop(`img/kk/${b.dataset.s}.webp`, c?.querySelector('.photos') || c); return addComment(w, `[kk:${b.dataset.s}]`); },
  // 댓글 하트: 화면 전체를 다시 그리지 않고 이 버튼만 바꿈(피드·프로필·검색 어디서든)
  'cm-like': async b => {
    const cid = b.dataset.cid, l = S.cl[cid] || [], on = l.includes(S.uid);
    b.disabled = true;
    ok(on ? await sb.from('comment_likes').delete().eq('comment_id', cid).eq('user_id', S.uid) : await sb.from('comment_likes').insert({ comment_id: cid }));
    S.cl[cid] = on ? l.filter(x => x !== S.uid) : [...l, S.uid];
    b.setAttribute('aria-pressed', !on); b.querySelector('span').textContent = S.cl[cid].length || ''; b.disabled = false;
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
    pop(kkTease(), null, `${nameOf(b.dataset.to)} 약올림 완료`);
  },
  goto: b => goToWorkout(b.dataset.id),
};

async function addComment(w, body) {
  const c = ok(await sb.from('comments').insert({ workout_id: w.id, body }).select().single());
  w.comments.push(c); w._open = true; if (S.cl) S.cl[c.id] = []; return renderFeed();
}

export const forms = {
  comment: async f => {
    const body = f.querySelector('input').value.trim(); if (!body) return;
    const wid = f.closest('[data-wid]').dataset.wid;
    return addComment([S.feed, S.ppList, S.searchList].flatMap(l => l || []).find(x => x.id === wid), body);
  },
};

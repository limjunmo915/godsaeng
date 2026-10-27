// 전체 화면 프로필 페이지 (스트라바 프로필 벤치마킹 → 기획문서/07)
// 친구·크루·나: 전부(사진·이번 달·운동 기록·통계·최고 기록·장비·배지·크루)
// 그 외: 숫자(팔로잉·팔로워·운동·연속 주·이번 달)와 함께 아는 친구만. 기록 내용은 서버가 안 보냄(supabase/011 profile_preview)
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { DAY, esc, ago, toast, fmtNum, fmtDur, fmtDate, startOf } from '../lib/util.js';
import { typeOf, points } from '../lib/types.js';
import { avatar, hue, nameOf, sum, streaks, badges, bests } from '../lib/calc.js';
import { signAvatars, signPhotos, isFriend, loadBlocks, loadFollows, loadFeed, FEED_SEL } from '../lib/data.js';
import { relBtn } from './friends.js';
import { card } from './feed.js';
import { lineChart } from './body.js';
import { show, refresh } from '../nav.js';

const inCrew = id => S.crews.some(c => S.members[c.id]?.includes(id));
const sharedCrew = id => S.crews.find(c => S.members[c.id]?.includes(id))?.id;
// 프로필 사진 크게 보기: 나, 내가 팔로우한 사람, 같은 크루, 친구
const canEnlarge = id => id === S.uid || S.following.includes(id) || inCrew(id) || isFriend(id);

// 열기(다른 사람 프로필에서 또 누르면 쌓였다가 ← 로 돌아옴)
export async function openProfile(id, again) {
  const p = ok(await sb.rpc('profile_preview', { uid: id }))[0];
  if (!p) return toast('볼 수 없는 프로필이에요');
  S.people[id] = { ...S.people[id], ...p };
  const open = id === S.uid || isFriend(id) || inCrew(id);
  const [list, gear, mutual] = await Promise.all([
    open ? sb.rpc('crew_workouts').select(FEED_SEL).eq('user_id', id).order('started_at', { ascending: false }).limit(1000).then(ok) : [],
    id === S.uid ? S.gear : open ? sb.from('gear').select('*').eq('user_id', id).then(ok) : [],
    id === S.uid ? [] : sb.rpc('mutual_friends', { uid: id }).then(ok),
  ]);
  for (const m of mutual) S.people[m.id] = { ...S.people[m.id], ...m };
  await Promise.all([signAvatars().catch(console.error), signPhotos(list.flatMap(w => w.photos))]);
  if (!again) S.ppStack = [...(S.pp ? S.ppStack : []), id];
  S.pp = { id, p, open, list, gear, mutual, page: S.pp?.id === id ? S.pp.page : 'main', statType: 'all', media: 'grid' };
  S.ppList = list;
  $('#pp').hidden = false; document.body.classList.add('pp-open');
  renderPP(); if (!again) $('#pp').scrollTo(0, 0);
}
export function closeProfile() {
  $('#pp').hidden = true; if ($('#srch').hidden) document.body.classList.remove('pp-open');
  S.pp = null; S.ppList = null; S.ppStack = [];
}

const row = (act, icon, title, subtitle, extra = '') =>
  `<button type="button" class="pp-row" data-act="${act}" ${extra}>${ic(icon)}<span><b>${title}</b>${subtitle ? `<small>${subtitle}</small>` : ''}</span>${ic('chevron-right')}</button>`;
const top = (title, right = '') => `<header class="pp-top"><button class="icbtn" data-act="pp-back" aria-label="뒤로">${ic('chevron-left')}</button>${title ? `<h2>${title}</h2>` : '<span></span>'}<div>${right}</div></header>`;
const lockCard = (p, msg) => `<div class="locked"><div class="ghost" aria-hidden="true"><i></i><i></i><i></i></div>
  <p>${ic('lock')}${p.last_type ? `${esc(typeOf(p.last_type).label)} · ${ago(p.last_at)}` : '아직 공개한 기록이 없어요'}</p><small>${msg}</small></div>`;

function mainPage() {
  const { id, p, open, list, gear, mutual } = S.pp, me = id === S.uid, friend = isFriend(id);
  const mo = startOf('month'), month = sum(list.filter(w => +new Date(w.started_at) >= mo)), t = p.top_type && typeOf(p.top_type);
  // 최근 12개월 운동 시간(시간)
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(mo); d.setMonth(d.getMonth() - 11 + i); return d; });
  const pts = months.map((d, i) => { const end = i < 11 ? +months[i + 1] : Infinity;
    return { t: +d, v: sum(list.filter(w => { const x = +new Date(w.started_at); return x >= +d && x < end; })).minutes / 60 }; });
  const photos = list.flatMap(w => w.photos), st = streaks(list), bg = badges(list, st), on = bg.filter(b => b[2]);
  const mainGear = gear.find(g => !g.retired), gearKm = g => list.filter(w => w.gear_id === g.id).reduce((a, w) => a + +w.distance_km, 0);
  const crews = S.crews.filter(c => me || S.members[c.id]?.includes(id));
  const crewPoke = !friend && sharedCrew(id);

  const menu = me ? `<button class="icbtn" data-act="invite-link" aria-label="초대 링크">${ic('share-2')}</button><button class="icbtn" data-act="pp-edit" aria-label="설정">${ic('settings')}</button>`
    : `<details class="pp-menu"><summary class="icbtn" aria-label="더보기">${ic('dots-vertical')}</summary><div>
        ${friend ? `<button data-act="unfriend" data-id="${id}">친구 끊기</button>` : ''}<button data-act="pp-block" class="danger">차단하기</button></div></details>`;
  const actions = me ? `<button class="btn" data-act="invite-link">${ic('share-2')}초대 링크</button><button class="btn" data-act="pp-edit">${ic('pencil')}프로필 편집</button>`
    : `${friend ? `<details class="pp-menu inline"><summary class="btn">${ic('check')}친구 ▾</summary><div><button data-act="unfriend" data-id="${id}">친구 끊기</button></div></details>` : relBtn(id)}
       ${(friend || crewPoke) && !p.poke_off && !S.people[id]?.poke_off
         ? `<button class="taunt-btn" data-act="${friend ? 'poke-friend' : 'poke'}" data-to="${id}" ${crewPoke ? `data-crew="${crewPoke}"` : ''}>약올리기</button>` : ''}`;

  return top('', menu) + `
    <section class="pp-head">${avatar(id, 'xxl')}<div><h1>${esc(p.nickname)}</h1>${p.region ? `<span>${esc(p.region)}</span>` : ''}</div></section>
    ${p.bio ? `<p class="pp-bio">${esc(p.bio)}</p>` : ''}
    <div class="pp-nums">
      <button type="button" data-act="pp-go" data-page="following"><small>팔로잉</small><b>${p.following_count}</b></button>
      <button type="button" data-act="pp-go" data-page="followers"><small>팔로워</small><b>${p.follower_count}</b></button>
      <div><small>운동</small><b>${p.activity_count}</b></div>
      <div><small>연속 주</small><b>${p.week_streak}</b></div>
    </div>
    <div class="pp-actions">${actions}</div>
    ${mutual.length ? `<button type="button" class="pp-mutual" data-act="pp-go" data-page="mutual"><span class="stack">${mutual.slice(0, 5).map(m => avatar(m.id, 'sm')).join('')}</span>
      <span>함께 아는 친구 ${mutual.length}명</span><b>모두 보기</b></button>` : ''}
    ${open ? (photos.length ? `<div class="pp-media">${photos.slice(0, 3).map(ph => `<img alt="" src="${esc(S.urls[ph] || '')}" loading="lazy">`).join('')}
        <button type="button" data-act="pp-go" data-page="media" style="${photos[3] ? `background-image:url('${esc(S.urls[photos[3]] || '')}')` : ''}"><span>사진 전체</span></button></div>` : '')
      : lockCard(p, '맞팔로우하면 사진·운동 기록·통계를 볼 수 있어요')}
    <section class="pp-month">
      <h3>${t ? ic(t.icon) : ic('calendar')}이번 달</h3>
      <div class="pp-big">
        <div><small>운동</small><b>${open ? month.count : p.month_count}<small>회</small></b></div>
        <div><small>시간</small><b>${fmtDur(open ? month.minutes : +p.month_minutes)}</b></div>
        ${open && month.distance ? `<div><small>거리</small><b>${fmtNum(month.distance, 1)}<small> km</small></b></div>` : ''}
        ${open ? `<div><small>갓생 포인트</small><b>${fmtNum(month.points)}<small>P</small></b></div>` : ''}
      </div>
      ${open ? `<p class="hint">최근 12개월 운동 시간(시간)</p>${lineChart(pts, '시간', 1)}` : ''}
    </section>
    ${open ? `<nav class="pp-rows">
      ${row('pp-go', 'activity', '운동 기록', list[0] ? `${fmtDate(list[0].started_at)} · ${ago(list[0].started_at)}` : '아직 없어요', 'data-page="acts"')}
      ${row('pp-go', 'chart-bar', '통계', '최근 4주 평균 · 올해 · 전체', 'data-page="stats"')}
      ${row('pp-go', 'medal', '최고 기록', `${bests(list).length}개`, 'data-page="bests"')}
      ${gear.length ? row('pp-go', 'shoe', '장비', mainGear ? `${esc(mainGear.name)}: ${fmtNum(gearKm(mainGear), 1)} km` : `${gear.length}개`, 'data-page="gear"') : ''}
    </nav>
    <section class="pp-sec"><h3>배지함 <span>${on.length}</span></h3>
      <div class="badges">${(on.length ? on : bg).slice(0, 4).map(([i, l, o]) => `<div class="badge ${o ? 'on' : ''}"><span>${ic(i)}</span>${l}</div>`).join('')}</div>
      ${row('pp-go', 'trophy', '모든 배지', `${bg.length}개 중 ${on.length}개`, 'data-page="badges"')}</section>` : ''}
    ${crews.length ? `<section class="pp-sec"><h3>크루 <span>${crews.length}</span></h3><div class="pp-crews">${crews.map(c => `<span>${ic('users')}${esc(c.name)}</span>`).join('')}</div></section>` : ''}`;
}

function statsPage() {
  const { id, list } = S.pp, me = id === S.uid;
  const types = Object.entries(list.reduce((a, w) => (a[w.type] = (a[w.type] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  const f = l => S.pp.statType === 'all' ? l : l.filter(w => w.type === S.pp.statType);
  const yr = startOf('year'), wk4 = startOf('week') - 3 * 7 * DAY;
  const block = l => { const a = sum(f(l)), y = sum(f(l).filter(w => +new Date(w.started_at) >= yr)), r = sum(f(l).filter(w => +new Date(w.started_at) >= wk4));
    return { avg: [r.count / 4, r.minutes / 4, r.distance / 4], yr: [y.count, y.minutes, y.distance, y.elev, y.points], all: [a.count, a.minutes, a.distance, a.elev, a.points] }; };
  const them = block(list), mine = me ? null : block(S.mine);
  const fmt = [v => fmtNum(v, Number.isInteger(v) ? 0 : 1) + '회', v => fmtDur(v), v => fmtNum(v, 1) + ' km', v => fmtNum(v) + ' m', v => fmtNum(v) + 'P'];
  const labels = ['횟수', '시간', '거리', '오르막', '갓생 포인트'];
  const sec = (title, key) => `<h4 class="st-h">${title}</h4>${them[key].map((v, i) => `<div class="st-row"><span>${labels[i]}</span><b>${fmt[i](v)}</b>${mine ? `<em>${fmt[i](mine[key][i])}</em>` : ''}</div>`).join('')}`;
  return top('통계') + `
    <div class="st-tabs">${[['all', '전체', 'sparkles'], ...types.map(k => [k, typeOf(k).label, typeOf(k).icon])].map(([k, l, i]) =>
      `<button type="button" data-act="pp-stat" data-v="${k}" aria-pressed="${S.pp.statType === k}">${ic(i)}<span>${esc(l)}</span></button>`).join('')}</div>
    ${mine ? `<div class="st-row st-legend"><span></span><b>${esc(nameOf(id))}</b><em>나</em></div>` : ''}
    ${sec('최근 4주 평균 (주당)', 'avg')}${sec('올해', 'yr')}${sec('전체', 'all')}`;
}

function mediaPage() {
  const { list } = S.pp, grid = S.pp.media === 'grid';
  const tabs = `<div class="st-tabs two"><button type="button" data-act="pp-media" data-v="grid" aria-pressed="${grid}">${ic('photo')}<span>바둑판</span></button><button type="button" data-act="pp-media" data-v="list" aria-pressed="${!grid}">${ic('route')}<span>목록</span></button></div>`;
  const withPh = list.filter(w => w.photos.length);
  return top('사진 전체') + `<div class="pp-head center">${avatar(S.pp.id, 'xl')}<b>${esc(S.pp.p.nickname)}</b></div>${tabs}` + (grid
    ? `<div class="pp-grid">${withPh.flatMap(w => w.photos).map(ph => `<img alt="" src="${esc(S.urls[ph] || '')}" loading="lazy">`).join('')}</div>`
    : withPh.map(w => `<div class="pp-mlist"><b>${esc(w.title || typeOf(w.type).label)}</b><small>${fmtDate(w.started_at)}</small>
        <div>${w.photos.map(ph => `<img alt="" src="${esc(S.urls[ph] || '')}" loading="lazy">`).join('')}</div></div>`).join(''));
}

async function peoplePage(kind) {
  const { id } = S.pp, title = { following: '팔로잉', followers: '팔로워', mutual: '함께 아는 친구' }[kind];
  const people = kind === 'mutual' ? S.pp.mutual : ok(await sb.rpc('follow_list', { uid: id, which: kind }));
  for (const u of people) S.people[u.id] = { ...S.people[u.id], ...u };
  await signAvatars().catch(console.error);
  return top(title) + (people.map(u => `<div class="frow"><button type="button" class="nm" data-act="profile" data-id="${u.id}">${avatar(u.id, 'sm')}<span>${esc(u.nickname)}${u.region ? `<small>${esc(u.region)}</small>` : ''}</span></button>
    ${u.id === S.uid ? '' : relBtn(u.id)}</div>`).join('') || '<p class="hint">아직 아무도 없어요.</p>');
}

export async function renderPP() {
  if (!S.pp) return;
  const { page, list, gear } = S.pp;
  const gearKm = g => list.filter(w => w.gear_id === g.id).reduce((a, w) => a + +w.distance_km, 0);
  $('#pp-body').innerHTML = page === 'main' ? mainPage()
    : page === 'stats' ? statsPage()
    : page === 'media' ? mediaPage()
    : page === 'acts' ? top('운동 기록') + `<div class="feed">${list.map(card).join('') || '<p class="hint">아직 공개한 기록이 없어요.</p>'}</div>`
    : page === 'bests' ? top('최고 기록') + `<dl class="pbs">${bests(list).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') || '<p class="hint">아직 없어요.</p>'}</dl>`
    : page === 'badges' ? top('배지함') + `<div class="badges">${badges(list, streaks(list)).map(([i, l, o]) => `<div class="badge ${o ? 'on' : ''}"><span>${ic(i)}</span>${l}</div>`).join('')}</div>`
    : page === 'gear' ? top('장비') + gear.map(g => `<div class="gear"><span class="ticon">${ic(g.kind === 'bike' ? 'bike' : g.kind === 'shoes' ? 'shoe' : 'activity')}</span>
        <div><b>${esc(g.name)}</b>${g.retired ? '<span class="tag">은퇴</span>' : ''}<span class="num">${fmtNum(gearKm(g), 1)} km</span></div></div>`).join('')
    : await peoplePage(page);
}

async function viewAvatar(id) {
  const small = S.people[id]?.avatar_url;
  $('#photo-view img').hidden = !small; $('#pv-default').hidden = !!small;
  if (small) {
    // 큰 사진이 없거나(예전에 올린 사진) 볼 권한이 없으면 작은 사진으로
    const { data } = await sb.storage.from('photos').createSignedUrl(small.replace(/\.jpg$/, '-l.jpg'), 600);
    $('#photo-view img').src = data?.signedUrl || S.urls[small];
  } else {
    // 사진 없는 사람: 카톡처럼 기본 프로필(사람 모양 + 이름)
    $('#pv-default').style.setProperty('--h', hue(id));
    $('#pv-default b').textContent = nameOf(id);
  }
  $('#photo-view').showModal();
}

// 사진 누르면 크게(버튼 안의 사진은 그 버튼 동작이 우선)
document.addEventListener('click', e => {
  const img = e.target.closest('.av[data-uid]');
  if (!img || img.closest('[data-act]')) return;
  // 기본 프로필(사진 없음)은 누구나, 진짜 사진은 팔로우·크루·친구만
  if (!S.people[img.dataset.uid]?.avatar_url || canEnlarge(img.dataset.uid)) viewAvatar(img.dataset.uid);
  else toast('팔로우하면 프로필 사진을 크게 볼 수 있어요');
});
document.addEventListener('click', e => { if (e.target.closest('#photo-view')) $('#photo-view').close(); });

export const actions = {
  profile: b => openProfile(b.dataset.id),
  'pp-go': b => { S.pp.page = b.dataset.page; renderPP(); $('#pp').scrollTo(0, 0); },
  'pp-stat': b => { S.pp.statType = b.dataset.v; renderPP(); },
  'pp-media': b => { S.pp.media = b.dataset.v; renderPP(); },
  'pp-back': async () => {
    if (S.pp.page !== 'main') { S.pp.page = 'main'; return renderPP(); }
    S.ppStack.pop();
    if (!S.ppStack.length) return closeProfile();
    S.pp = null; const prev = S.ppStack.at(-1); S.ppStack = S.ppStack.slice(0, -1); return openProfile(prev);
  },
  'pp-edit': () => { closeProfile(); S.meTab = 'stats'; show('me'); setTimeout(() => { const d = document.querySelector('#v-me details.panel:last-of-type'); if (d) { d.open = true; d.scrollIntoView(); } }, 300); },
  'pp-block': async () => {
    const id = S.pp.id;
    if (!confirm(`${nameOf(id)}님을 차단할까요?\n서로 약올리기·댓글·반응을 할 수 없고 팔로우도 끊겨요. 설정에서 풀 수 있어요.`)) return;
    ok(await sb.from('blocks').upsert({ blocker: S.uid, blocked: id }));
    await Promise.all([loadBlocks(), loadFollows()]); await loadFeed(true);
    closeProfile(); toast('차단했어요'); return refresh();
  },
};

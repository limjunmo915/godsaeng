// 친구: 검색·팔로우·맞팔로우(친구)·초대 링크·친구 약올리기 (supabase/009)
// 팔로우만으론 아무것도 안 보이고, 서로 팔로우해야 친구 → 기록이 보이고 반응·댓글·약올리기 가능
import { S, sb, ok, $, WEB } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, pick, toast, fail, lsGet, lsSet } from '../lib/util.js';
import { POKES } from '../lib/types.js';
import { nameOf, avatar } from '../lib/calc.js';
import { loadFollows, loadFeed, signAvatars, isFriend } from '../lib/data.js';
import { refresh } from '../nav.js';
import { seg } from './rank.js';
import { openProfile } from './profile.js';

export const tabs = () => seg('crewTab', S.crewTab, [['crew', '크루'], ['friends', '친구']]);

// 이 사람과의 관계에 맞는 버튼
export function relBtn(id) {
  if (isFriend(id)) return `<span class="tag">${ic('check')}친구</span>`;
  if (S.following.includes(id)) return `<button class="btn sm" data-act="unfollow" data-id="${id}">요청 취소</button>`;
  if (S.followers.includes(id)) return `<button class="btn sm primary" data-act="follow" data-id="${id}">맞팔로우</button>`;
  return `<button class="btn sm primary" data-act="follow" data-id="${id}">팔로우</button>`;
}
// 이름(사진) 누르면 미리보기 프로필
const row = (id, right) => `<div class="frow"><button type="button" class="nm" data-act="profile" data-id="${id}">${avatar(id, 'sm')}<span>${esc(nameOf(id))}${S.people[id]?.region ? `<small>${esc(S.people[id].region)}</small>` : ''}</span></button>${right}</div>`;

export async function renderFriends() {
  const vis = id => !S.blocked.includes(id);
  const friends = S.following.filter(id => S.followers.includes(id) && vis(id));
  const incoming = S.followers.filter(id => !S.following.includes(id) && vis(id));
  const sent = S.following.filter(id => !S.followers.includes(id) && vis(id));
  $('#v-crew').innerHTML = `<h2 class="page-title">친구</h2>${tabs()}
    <section class="crew-card">
      <div class="crew-top"><b>친구 초대</b></div>
      <p class="hint">링크를 받은 사람이 가입하거나 로그인하면 바로 친구가 돼요.</p>
      <button class="btn wide" data-act="invite-link">${ic('copy')}초대 링크 복사</button>
    </section>
    <label class="field"><span>닉네임으로 찾기</span><input type="search" id="f-search" placeholder="2자 이상" autocomplete="off"></label>
    <div id="f-results"></div>
    ${incoming.length ? `<h3 class="sec">나를 팔로우한 사람 <small>맞팔로우하면 친구가 돼요</small></h3>
      ${incoming.map(id => row(id, `<button class="btn sm primary" data-act="follow" data-id="${id}">맞팔로우</button><button class="linkbtn" data-act="remove-follower" data-id="${id}">삭제</button>`)).join('')}` : ''}
    <h3 class="sec">친구 ${friends.length}명</h3>
    ${friends.map(id => row(id, `${S.people[id]?.poke_off ? '' : `<button class="taunt-btn sm" data-act="poke-friend" data-to="${id}">약올리기</button>`}<button class="linkbtn" data-act="unfriend" data-id="${id}">끊기</button>`)).join('')
      || '<p class="hint">아직 친구가 없어요. 초대 링크를 보내거나 닉네임으로 찾아 팔로우해 보세요.</p>'}
    ${sent.length ? `<h3 class="sec">보낸 팔로우 <small>상대가 맞팔로우하면 친구</small></h3>${sent.map(id => row(id, relBtn(id))).join('')}` : ''}`;
}

// 검색: 입력이 멈추면 서버에서 닉네임 찾기
let timer;
document.addEventListener('input', e => {
  if (e.target.id !== 'f-search') return;
  clearTimeout(timer);
  const q = e.target.value.trim();
  if (q.length < 2) return $('#f-results').innerHTML = '';
  timer = setTimeout(async () => {
    try {
      const list = ok(await sb.rpc('search_users', { q }));
      for (const p of list) S.people[p.id] = { ...S.people[p.id], ...p };
      await signAvatars().catch(console.error);
      if ($('#f-search')?.value.trim() !== q) return;
      $('#f-results').innerHTML = list.map(p => row(p.id, relBtn(p.id))).join('') || '<p class="hint">찾는 사람이 없어요.</p>';
    } catch (err) { fail(err); }
  }, 300);
});

async function reload(msg) {
  await loadFollows(); await signAvatars().catch(console.error); await loadFeed(true);
  if (msg) toast(msg);
  if (S.pp) await openProfile(S.pp.id, true);   // 프로필 페이지에서 팔로우했으면 페이지도 새로
  return refresh();
}

// 초대 링크로 들어온 경우(main.js 가 ?f=코드 를 저장해 둠): 로그인 뒤 바로 친구 맺기
export async function acceptInvite() {
  const code = lsGet('invite'); if (!code) return;
  lsSet('invite', '');
  try { const id = ok(await sb.rpc('add_friend_by_code', { c: code })); await loadFollows(); await signAvatars().catch(console.error); toast(`${nameOf(id)}님과 친구가 됐어요!`); await loadFeed(true); refresh(); }
  catch (err) { fail(err); }
}

export const actions = {
  'invite-link': async () => {
    const code = ok(await sb.rpc('my_friend_code'));
    const text = `갓생살기에서 같이 운동하고 서로 약올려요! 질 수 없다 💪\n${WEB}?f=${code}`;
    try { await navigator.clipboard.writeText(text); toast('초대 링크를 복사했어요. 카톡으로 보내 보세요'); } catch { prompt('이 링크를 복사해서 보내세요', text); }
  },
  follow: async b => {
    b.disabled = true;
    ok(await sb.from('follows').insert({ follower: S.uid, followee: b.dataset.id }));
    return reload(S.followers.includes(b.dataset.id) ? `${nameOf(b.dataset.id)}님과 친구가 됐어요!` : '팔로우했어요. 상대가 맞팔로우하면 친구가 돼요');
  },
  unfollow: async b => {
    ok(await sb.from('follows').delete().eq('follower', S.uid).eq('followee', b.dataset.id));
    return reload('팔로우를 취소했어요');
  },
  'remove-follower': async b => {
    ok(await sb.from('follows').delete().eq('follower', b.dataset.id).eq('followee', S.uid));
    return reload();
  },
  unfriend: async b => {
    if (!confirm(`${nameOf(b.dataset.id)}님과 친구를 끊을까요? 서로 기록이 보이지 않게 돼요(같은 크루라면 크루에선 계속 보여요).`)) return;
    ok(await sb.from('follows').delete().or(`and(follower.eq.${S.uid},followee.eq.${b.dataset.id}),and(follower.eq.${b.dataset.id},followee.eq.${S.uid})`));
    return reload('친구를 끊었어요');
  },
  'poke-friend': async b => {
    b.disabled = true;
    ok(await sb.from('pokes').insert({ to_id: b.dataset.to, crew_id: null, text: pick(POKES) }));
    toast(`${nameOf(b.dataset.to)} 약올림 완료 😏`);
  },
};

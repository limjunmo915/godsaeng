// 미리보기 프로필(supabase/010 profile_preview) + 프로필 사진 크게 보기
// 친구가 아니면 기록 내용은 안 받고 "달리기 · 2일 전"만. 흐린 카드는 가짜 무늬(실제 기록이 새지 않게)
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, ago, toast } from '../lib/util.js';
import { typeOf } from '../lib/types.js';
import { avatar } from '../lib/calc.js';
import { signAvatars, isFriend } from '../lib/data.js';
import { relBtn } from './friends.js';

const inCrew = id => S.crews.some(c => S.members[c.id]?.includes(id));
// 크게 보기: 나, 내가 팔로우한 사람, 같은 크루, 친구
const canEnlarge = id => id === S.uid || S.following.includes(id) || inCrew(id) || isFriend(id);

export async function openProfile(id) {
  S.profileId = id;
  const p = ok(await sb.rpc('profile_preview', { uid: id }))[0];
  if (!p) return toast('볼 수 없는 프로필이에요');
  S.people[id] = { ...S.people[id], ...p };
  await signAvatars().catch(console.error);
  const t = p.top_type && typeOf(p.top_type), open = isFriend(id) || inCrew(id);
  const sub = [p.region, t && `${t.label} 위주`].filter(Boolean).map(esc).join(' · ');
  $('#profile-body').innerHTML = `
    <div class="pv-head">${avatar(id, 'xl')}<div><b>${esc(p.nickname)}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>
    ${p.bio ? `<p class="pv-bio">${esc(p.bio)}</p>` : ''}
    <p class="pv-stat">이번 달 <b>${p.month_count}회</b> 운동 · 친구 <b>${p.friend_count}명</b></p>
    ${open ? `<p class="hint">${isFriend(id) ? '친구예요.' : '같은 크루예요.'} 피드에서 기록을 볼 수 있어요.</p>`
      : `<div class="locked"><div class="ghost" aria-hidden="true"><i></i><i></i><i></i></div>
          <p>${ic('lock')}${p.last_type ? `${esc(typeOf(p.last_type).label)} · ${ago(p.last_at)}` : '아직 공개한 기록이 없어요'}</p>
          <small>맞팔로우하면 기록을 볼 수 있어요</small></div>`}
    ${id !== S.uid ? `<div class="pv-act">${relBtn(id)}</div>` : ''}`;
  if (!$('#profile').open) $('#profile').showModal();
}

async function viewAvatar(id) {
  const small = S.people[id]?.avatar_url;
  if (!small) return;
  // 큰 사진이 없거나(예전에 올린 사진) 볼 권한이 없으면 작은 사진으로
  const { data } = await sb.storage.from('photos').createSignedUrl(small.replace(/\.jpg$/, '-l.jpg'), 600);
  $('#photo-view img').src = data?.signedUrl || S.urls[small];
  $('#photo-view').showModal();
}

// 사진 누르면 크게(버튼 안의 사진은 그 버튼 동작이 우선)
document.addEventListener('click', e => {
  const img = e.target.closest('img.av[data-uid]');
  if (!img || img.closest('[data-act]')) return;
  if (canEnlarge(img.dataset.uid)) viewAvatar(img.dataset.uid);
  else toast('팔로우하면 프로필 사진을 크게 볼 수 있어요');
});
document.addEventListener('click', e => { if (e.target.closest('#photo-view')) $('#photo-view').close(); });

export const actions = {
  profile: b => openProfile(b.dataset.id),
  'close-profile': () => $('#profile').close(),
};

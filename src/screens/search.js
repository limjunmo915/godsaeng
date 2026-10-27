// 전체 검색(상단 돋보기): [사람 | 기록] 탭
// 사람 = 닉네임(search_users, 검색 노출 켠 사람) / 기록 = 내가 볼 수 있는 기록(crew_workouts: 내 것·크루·친구)의 제목·메모·한마디·종목·작성자
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, fail } from '../lib/util.js';
import { TYPES } from '../lib/types.js';
import { avatar } from '../lib/calc.js';
import { signAvatars, signPhotos, FEED_SEL } from '../lib/data.js';
import { relBtn } from './friends.js';
import { card } from './feed.js';

function render() {
  const { q, tab, people, recs } = S.srch;
  $('#srch-tabs').innerHTML = q.length < 2 ? '' : [['people', `사람 ${people.length}`], ['recs', `기록 ${recs.length}`]].map(([k, l]) =>
    `<button type="button" data-act="srch-tab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join('');
  $('#srch-list').innerHTML = q.length < 2 ? '<p class="hint">2자 이상 입력하면 사람과 기록을 함께 찾아요.<br>예: 닉네임, 한강, 테니스, 아침</p>'
    : tab === 'people'
      ? people.map(u => `<div class="frow"><button type="button" class="nm" data-act="profile" data-id="${u.id}">${avatar(u.id, 'sm')}<span>${esc(u.nickname)}${u.region ? `<small>${esc(u.region)}</small>` : ''}</span></button>${u.id === S.uid ? '' : relBtn(u.id)}</div>`).join('') || '<p class="hint">찾는 사람이 없어요.</p>'
      : `<div class="feed">${recs.map(card).join('') || '<p class="hint">찾는 기록이 없어요.</p>'}</div>`;
}

async function run(q) {
  // PostgREST 필터 문법을 깨는 글자는 빼고 검색
  const safe = q.replace(/[,()*%"\\]/g, ' ').trim();
  const types = Object.entries(TYPES).filter(([, t]) => t.label.includes(safe)).map(([k]) => k);
  const authors = Object.values(S.people).filter(p => p.nickname?.includes(safe)).map(p => p.id);
  const or = ['title', 'memo', 'brag'].map(c => `${c}.ilike."*${safe}*"`)
    .concat(types.length ? [`type.in.(${types.join(',')})`] : [], authors.length ? [`user_id.in.(${authors.join(',')})`] : []).join(',');
  const [people, recs] = await Promise.all([
    sb.rpc('search_users', { q: safe }).then(ok),
    // ponytail: 최근 50개까지만. 기록이 많아지면 '더 보기' 추가
    sb.rpc('crew_workouts').select(FEED_SEL).or(or).order('started_at', { ascending: false }).limit(50).then(ok),
  ]);
  if (S.srch.q !== q) return;   // 그 사이 검색어가 바뀜
  for (const p of people) S.people[p.id] = { ...S.people[p.id], ...p };
  const filtered = recs.filter(w => !S.blocked.includes(w.user_id));
  await Promise.all([signAvatars().catch(console.error), signPhotos(filtered.flatMap(w => w.photos))]);
  Object.assign(S.srch, { people, recs: filtered, tab: S.srch.tab || (people.length || !filtered.length ? 'people' : 'recs') });
  S.searchList = filtered;
  render();
}

let timer;
document.addEventListener('input', e => {
  if (e.target.id !== 'srch-q') return;
  clearTimeout(timer);
  const q = e.target.value.trim();
  Object.assign(S.srch, { q, tab: null, people: [], recs: [] });
  if (q.length < 2) return render();
  timer = setTimeout(() => run(q).catch(err => fail(err)), 300);
});

export const rerender = () => S.srch && render();

export const actions = {
  'search-open': () => {
    S.srch = { q: '', tab: null, people: [], recs: [] };
    $('#srch').hidden = false; document.body.classList.add('pp-open');
    $('#srch-q').value = ''; render(); $('#srch-q').focus();
  },
  'search-close': () => {
    $('#srch').hidden = true; S.srch = null; S.searchList = null;
    if (!document.querySelector('.pp:not([hidden])')) document.body.classList.remove('pp-open');
  },
  'srch-tab': b => { S.srch.tab = b.dataset.v; render(); },
};

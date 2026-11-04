// 종목 고르기 창: 그룹별 전체 종목 + 아이콘, 별(☆)로 즐겨찾기 5개 → 기록 화면·측정 화면의 대표 종목
import { $ } from '../state.js';
import { ic, sportIc } from '../lib/icons.js';
import { toast } from '../lib/util.js';
import { TYPE_GROUPS, TYPES, favTypes, setFavTypes, gpsType } from '../lib/types.js';

let onPick = null, onFav = null, track = false;
// track: 측정 화면에서 열면 종목마다 'GPS'·'시간만' 표시
export function openSports(pick, { forTrack = false, changed } = {}) {
  onPick = pick; onFav = changed; track = forTrack;
  draw(); $('#sport-dlg').showModal(); $('#sport-dlg').scrollTop = 0;
}
function draw() {
  const fav = favTypes();
  const row = k => `<div class="sp-row"><button type="button" class="sp-name" data-act="sp-pick" data-k="${k}">${sportIc(k, TYPES[k].icon)}<span>${TYPES[k].label}</span>${track ? `<small class="tag">${gpsType(k) ? 'GPS' : '시간만'}</small>` : ''}</button>`
    + `<button type="button" class="icbtn sp-star" data-act="sp-star" data-k="${k}" aria-pressed="${fav.includes(k)}" aria-label="${TYPES[k].label} 즐겨찾기">${ic('star')}</button></div>`;
  $('#sport-list').innerHTML = (fav.length ? `<h3 class="sp-g">즐겨찾기</h3>${fav.map(row).join('')}` : '')
    + Object.entries(TYPE_GROUPS).map(([g, list]) => `<h3 class="sp-g">${g}</h3>${list.map(([k]) => row(k)).join('')}`).join('');
}
export const actions = {
  'sp-pick': b => { $('#sport-dlg').close(); onPick?.(b.dataset.k); },
  'sp-close': () => $('#sport-dlg').close(),
  'sp-star': b => {
    const f = favTypes(), k = b.dataset.k;
    if (f.includes(k)) setFavTypes(f.filter(x => x !== k));
    else if (f.length >= 5) return toast('즐겨찾기는 5개까지예요. 하나를 빼고 다시 눌러 주세요.');
    else setFavTypes([...f, k]);
    const y = $('#sport-dlg').scrollTop; draw(); $('#sport-dlg').scrollTop = y; onFav?.();
  },
};

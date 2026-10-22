// 탭 전환과 현재 화면 다시 그리기
import { S, $ } from './state.js';
import { fail } from './lib/util.js';
import { renderFeed } from './screens/feed.js';
import { renderRank } from './screens/rank.js';
import { renderCrew } from './screens/crew.js';
import { renderMe } from './screens/me.js';

export function show(tab, noRender) {
  S.tab = tab;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const v of ['feed', 'rank', 'log', 'crew', 'me']) $('#v-' + v).hidden = v !== tab;
  scrollTo({ top: 0 });
  if (tab !== 'log' && !noRender) refresh();
}
export function refresh() {
  const r = { feed: renderFeed, rank: renderRank, crew: renderCrew, me: renderMe }[S.tab];
  r?.().catch(err => fail(err, '화면을 그리지 못했어요.'));
}

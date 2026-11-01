// 탭 전환과 현재 화면 다시 그리기
import { S, $ } from './state.js';
import { fail } from './lib/util.js';
import { renderFeed } from './screens/feed.js';
import { renderRank } from './screens/rank.js';
import { renderCrew } from './screens/crew.js';
import { renderMe } from './screens/me.js';

const past = [];   // 지나온 탭(뒤로 가기용). 피드(홈)로 오면 비움
export function show(tab, noRender) {
  if (tab === 'feed') past.length = 0; else if (S.tab && S.tab !== tab) past.push(S.tab);
  S.tab = tab;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const v of ['feed', 'rank', 'log', 'crew', 'me']) $('#v-' + v).hidden = v !== tab;
  $('#ad-top').hidden = tab === 'feed'; if (tab !== 'feed') slogan();
  scrollTo({ top: 0 });
  if (tab !== 'log' && !noRender) refresh();
}
// 뒤로 가기: 바로 전 탭으로(show 가 지금 탭을 다시 쌓으니 하나 버림), 더 없으면 피드
export function backTab() { show(past.pop() || 'feed'); past.pop(); }
export function refresh() {
  const r = { feed: renderFeed, rank: renderRank, crew: renderCrew, me: renderMe }[S.tab];
  r?.().catch(err => fail(err, '화면을 그리지 못했어요.'));
}

// 상단 띠(피드 빼고 모든 탭, 카톡 상단 배너 자리): 광고 없을 땐 앱 이름 + 응원 문구가 오른쪽→왼쪽으로 흐름, 한 바퀴마다 문구 바뀜
// 광고(AdMob·애드핏 비교 예정)를 붙이면 여기서 광고가 있으면 광고, 없으면 이 문구
const SLOGANS = ['오늘도 갓생 살아보자', '어제의 나보다 1km만 더', '크루가 지켜보고 있다', '운동 안 하면 약올림 당함', '땀은 거짓말을 안 한다',
  '10분만 걸어도 갓생 시작', '라이벌은 이미 뛰고 왔다', '기록은 남고 핑계는 사라진다', '스트릭 끊기기 전에 딱 한 번만', '작심삼일도 열 번이면 한 달',
  '쉬는 것도 계획이면 인정', '오늘 흘린 땀이 내일의 자랑'];
const slogan = () => { $('#ad-txt').textContent = SLOGANS[Math.floor(Math.random() * SLOGANS.length)]; };
$('#ad-txt').addEventListener('animationiteration', slogan);

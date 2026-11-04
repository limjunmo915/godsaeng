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

// 상단 띠(피드 빼고 모든 탭, 카톡 상단 배너 자리): 광고 없을 땐 앱 이름 + 응원 문구가 오른쪽→왼쪽으로 흐름
// 탭을 옮길 때마다·한 바퀴마다 다른 문구(바로 전 문구는 안 나옴). 광고(AdMob·애드핏)를 붙이면 광고가 있을 땐 광고, 없으면 이 문구
const SLOGANS = ['오늘도 갓생 살아보자', '어제의 나보다 1km만 더', '크루가 지켜보고 있다', '운동 안 하면 약올림 당함', '땀은 거짓말을 안 한다',
  '10분만 걸어도 갓생 시작', '라이벌은 이미 뛰고 왔다', '기록은 남고 핑계는 사라진다', '스트릭 끊기기 전에 딱 한 번만', '작심삼일도 열 번이면 한 달',
  '쉬는 것도 계획이면 인정', '오늘 흘린 땀이 내일의 자랑', '시작이 반, 운동화 끈 묶으면 반의반', '소파가 부르면 못 들은 척', '내일의 나에게 핑계를 남기지 말자',
  '느려도 멈추지만 않으면 된다', '운동은 배신하지 않는다, 다만 늦을 뿐', '1등은 몰라도 꼴찌는 싫다', '귀찮음을 이기면 그게 갓생', '계단 한 층도 운동이다',
  '오늘 안 하면 내일 두 배로 약올림', '컨디션은 핑계, 기록은 증거', '딱 5분만 하자, 그러다 30분 된다', '숨차는 건 살아 있다는 증거', '거울 속 나랑 경쟁 중',
  '친구가 뛴 거리만큼은 나도 간다', '갓생은 거창하지 않다, 꾸준할 뿐', '땀 한 방울에 핑계 하나씩 지우기', '어제 쉬었으면 오늘은 두 걸음', '지금 일어나면 오늘의 승자',
  '크루 단톡방에 자랑할 거리 만들기', '물 한 잔 마시고 스트레칭 한 번', '오늘의 운동이 내일의 체력', '포기하고 싶을 때 딱 1분만 더', '근육은 휴식 중에 자란다, 그러니 오늘은 하자',
  '비 오면 실내 운동, 핑계는 없다', '빨리보다 오래, 오래보다 꾸준히', '약올림 당하기 전에 먼저 움직이기', '이번 주 랭킹, 아직 안 끝났다', '오늘 걸은 걸음이 쌓이면 여행이 된다'];
let last = -1;
const slogan = () => {
  let i; do i = Math.floor(Math.random() * SLOGANS.length); while (i === last); last = i;
  const t = $('#ad-txt'); t.textContent = SLOGANS[i];
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';   // 처음(오른쪽 끝)부터 다시 흐르게
};
$('#ad-txt').addEventListener('animationiteration', slogan);

// Tabler 선 아이콘. 쓰는 것만 골라 빌드에 포함 (목록에 없는 이름은 activity 로 대체)
const raw = import.meta.glob(
  '../../node_modules/@tabler/icons/icons/outline/{run,walk,treadmill,trekking,mountain,wheelchair,bike,bolt,wheel,swimming,kayak,sailboat,wave-sine,wind,ski-jumping,snowboarding,snowflake,ice-skating,roller-skating,skateboarding,barbell,weight,flame,stretching,stretching-2,activity,stairs-up,yoga,music,first-aid-kit,ball-tennis,ping-pong,ball-football,ball-basketball,ball-volleyball,cricket,golf,ball-baseball,sparkles,home,trophy,plus,users,user,bell,search,chevron-right,chevron-left,lock,message-circle,share-2,pencil,trash,x,camera,calendar,calendar-stats,route,trending-up,trending-down,crown,medal,award,shoe,heart-rate-monitor,copy,logout,settings,chart-bar,stopwatch,sun,moon,target,photo,check,eye-off,flag,bulb,dots-vertical,send,current-location,volume,volume-off,player-play,mood-smile}.svg',
  { query: '?raw', import: 'default', eager: true },
);
const ICONS = Object.fromEntries(Object.entries(raw).map(([p, svg]) => [
  p.split('/').pop().slice(0, -4),
  svg.replace(/\s+/g, ' ').replace(/ class="[^"]*"/, '').replace(/ width="24" height="24"/, '').replace('<svg ', '<svg class="ic" aria-hidden="true" '),
]));

export const ic = (name, cls = '') => (ICONS[name] || ICONS.activity).replace('class="ic"', `class="ic ${cls}"`);

// 정적 HTML 의 <i data-ic="이름"> 을 아이콘으로 채움
export const fillIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach(el => { el.outerHTML = ic(el.dataset.ic, el.className); });

// 사용자가 만든 그림(src/public/img, 10-29): 반응 스티커·종목 아이콘. 그림이 없는 종목은 선 아이콘
const SPORT = { run: 'run', walk: 'walk', ride: 'ride', gym: 'weight', hike: 'hike', swim: 'swim', yoga: 'yoga', tennis: 'tennis' };
export const sportIc = (k, icon) => SPORT[k] ? `<img class="sp" src="img/sp-${SPORT[k]}.webp" alt="">` : ic(icon);
// 깐족이 스티커: 반응 4종(인정·질 수 없다·그게 다야?·누워있음), 약올리기는 8개 중 무작위
const KK_RX = { fire: 'rx-respect', mad: 'rx-fire', meh: 'tease-shrug', sofa: 'rx-sofa' };
const TEASE = ['merong', 'snicker', 'rofl', 'chill', 'bye', 'shrug', 'flex', 'trophy'];
export const kkRx = k => `img/kk/${KK_RX[k]}.webp`;
export const kkTease = () => `img/kk/tease-${TEASE[Math.floor(Math.random() * TEASE.length)]}.webp`;
// 댓글 스티커: 내용을 '[kk:이름]' 으로 저장(DB 변경 없음), 화면에선 깐족이 그림으로
export const STICKERS = ['cm-cheer', 'cm-thanks', 'cm-wow', 'cm-hi5', 'cm-lol', 'cm-envy', 'cm-nope', 'cm-night', ...TEASE.map(t => 'tease-' + t), 'rx-respect', 'rx-clap', 'rx-fire', 'rx-cry', 'rx-mad', 'rx-shock', 'rx-sofa', 'rx-love',
  'mood-melt', 'mood-water', 'mood-stretch', 'mood-chicken', 'mood-sleep', 'mood-run', 'mood-lift', 'mood-party',
  'rank-king', 'rank-podium', 'rank-last', 'rank-turtle', 'streak-fire', 'streak-broken', 'goal-done', 'crew-arm'];
export const stickerOf = body => { const m = /^\[kk:([a-z-]+)\]$/.exec(body || ''); return m && STICKERS.includes(m[1]) ? m[1] : null; };
export const cmText = body => stickerOf(body) ? '(스티커)' : body;
// 빈 화면: 깐족이 그림 + 한 줄(글은 코드에 적힌 고정 문구만)
export const kkEmpty = (img, text) => `<div class="kk-empty"><img src="img/kk/${img}.webp" alt=""><p>${text}</p></div>`;
export const rxImg = k => `<img class="rx-img" src="${kkRx(k)}" alt="">`;

// Tabler 선 아이콘. 쓰는 것만 골라 빌드에 포함 (목록에 없는 이름은 activity 로 대체)
const raw = import.meta.glob(
  '../../node_modules/@tabler/icons/icons/outline/{run,walk,treadmill,trekking,mountain,wheelchair,bike,bolt,wheel,swimming,kayak,sailboat,wave-sine,wind,ski-jumping,snowboarding,snowflake,ice-skating,roller-skating,skateboarding,barbell,weight,flame,stretching,stretching-2,activity,stairs-up,yoga,music,first-aid-kit,ball-tennis,ping-pong,ball-football,ball-basketball,ball-volleyball,cricket,golf,ball-baseball,sparkles,home,trophy,plus,users,user,bell,search,chevron-right,chevron-left,lock,message-circle,share-2,pencil,trash,x,camera,calendar,calendar-stats,route,trending-up,trending-down,crown,medal,award,shoe,heart-rate-monitor,copy,logout,settings,chart-bar,stopwatch,sun,moon,target,photo,check,eye-off,flag,bulb,dots-vertical,send,current-location,volume,volume-off}.svg',
  { query: '?raw', import: 'default', eager: true },
);
const ICONS = Object.fromEntries(Object.entries(raw).map(([p, svg]) => [
  p.split('/').pop().slice(0, -4),
  svg.replace(/\s+/g, ' ').replace(/ class="[^"]*"/, '').replace(/ width="24" height="24"/, '').replace('<svg ', '<svg class="ic" aria-hidden="true" '),
]));

export const ic = (name, cls = '') => (ICONS[name] || ICONS.activity).replace('class="ic"', `class="ic ${cls}"`);

// 정적 HTML 의 <i data-ic="이름"> 을 아이콘으로 채움
export const fillIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach(el => { el.outerHTML = ic(el.dataset.ic, el.className); });

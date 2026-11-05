// 앱 시작: 로그인, 부팅, 공통 클릭·폼 처리
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/archivo/latin-800-italic.css';   // 큰 숫자용 기울어진 운동 글꼴(D 시안, 숫자·영문만)
import '@fontsource/archivo/latin-900-italic.css';
import './styles.css';
import { S, sb, ok, $, WEB } from './state.js';
import { fillIcons } from './lib/icons.js';
import { toast, fail, lsGet, lsSet, fullName } from './lib/util.js';
import { loadCore, loadFeed, loadMine, loadBody } from './lib/data.js';
import { show, refresh, backTab } from './nav.js';
import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { App } from '@capacitor/app';
import * as feed from './screens/feed.js';
import * as rank from './screens/rank.js';
import * as crew from './screens/crew.js';
import * as me from './screens/me.js';
import * as body from './screens/body.js';
import * as notif from './screens/notif.js';
import * as report from './screens/report.js';
import * as consent from './screens/consent.js';
import * as friends from './screens/friends.js';
import * as profile from './screens/profile.js';
import * as search from './screens/search.js';
import * as msg from './screens/msg.js';
import * as track from './screens/track.js';
import * as sports from './screens/sports.js';
import * as when from './screens/when.js';
import * as watch from './screens/watch.js';
import * as settings from './screens/settings.js';
import { initForm, resetForm, takeShared } from './screens/log.js';

const actions = { ...feed.actions, ...rank.actions, ...crew.actions, ...me.actions, ...body.actions, ...notif.actions, ...report.actions, ...consent.actions, ...friends.actions, ...profile.actions, ...search.actions, ...msg.actions, ...track.actions, ...sports.actions, ...when.actions, ...watch.actions, ...settings.actions,
  go: b => { if (b.dataset.tab === 'log') resetForm(); show(b.dataset.tab); },
  'intro-next': () => introAt < INTRO.length - 1 ? intro(introAt + 1) : $('#intro').close(),
  'intro-skip': () => $('#intro').close() };
const forms = {
  newpw: async (f, d) => {
    if (d.pw.length < 6) return toast('6자 이상 입력해 주세요.');
    ok(await sb.auth.updateUser({ password: d.pw })); $('#pw-reset').close(); toast('비밀번호를 바꿨어요');
  },
  ...feed.forms, ...crew.forms, ...me.forms, ...body.forms, ...report.forms, ...consent.forms, ...msg.forms };

fillIcons();
// 친구 초대 링크(?f=코드): 저장해 두고 주소창에서 지움 → 로그인 뒤 friends.acceptInvite()
{ const q = new URLSearchParams(location.search), f = q.get('f');
  if (f) { lsSet('invite', f); $('#l-invited').hidden = false; }
  // GPS 기록 시험: ?gps=sim 가짜 경로, ?gps=off 실제 GPS로 되돌리기
  if (q.has('gps')) q.get('gps') === 'off' ? localStorage.removeItem('gps') : lsSet('gps', q.get('gps'));
  if (f || q.has('share') || q.has('gps')) history.replaceState(null, '', location.pathname); }   // ?share=1 = 공유받기(sw.js)
$('#terms-gate').addEventListener('cancel', e => e.preventDefault());
// 보기용 창(반응한 사람·알림·종목 고르기)은 바깥(어두운 부분)을 눌러도 닫힘
document.addEventListener('click', e => { if (e.target.matches?.('dialog#rx-dlg, dialog#notif, dialog#sport-dlg, dialog#when-dlg, dialog#watch-dlg')) e.target.close(); });  // Esc 로 닫고 넘어가지 못하게

/* 로그인 */
const showLogin = () => { $('#app').hidden = true; $('#login').hidden = false; };
$('#l-toggle').onclick = () => {
  S.loginMode = S.loginMode === 'in' ? 'up' : 'in';
  const up = S.loginMode === 'up';
  document.querySelectorAll('.up-only').forEach(el => { el.hidden = !up; });
  document.querySelectorAll('.in-only').forEach(el => { el.hidden = up; });
  $('#l-submit').textContent = up ? '가입하기' : '로그인';
  $('#l-toggle').textContent = up ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 회원가입';
  $('#l-pw').autocomplete = up ? 'new-password' : 'current-password';
};
// 가입 화면: 나라에 맞춰 이름 순서 미리 보기
const nameOut = () => { const f = $('#l-family').value.trim(), g = $('#l-given').value.trim(); $('#l-name-out').textContent = f && g ? `크루·친구에게 "${fullName(f, g, $('#l-country').value)}"(으)로 보여요` : '크루·친구에게 실명으로 보여요'; };
['#l-family', '#l-given', '#l-country'].forEach(s => $(s).addEventListener('input', nameOut));
// 예시도 나라에 맞춰: 한국 등은 김 / 갓생, 그 밖은 Saeng / God(→ God Saeng)
$('#l-country').addEventListener('change', () => { const ko = ['KR', 'JP', 'CN', 'TW'].includes($('#l-country').value); $('#l-family').placeholder = ko ? '김' : 'Saeng'; $('#l-given').placeholder = ko ? '갓생' : 'God'; nameOut(); });
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const email = $('#l-email').value.trim(), password = $('#l-pw').value;
  if (!email || password.length < 6) return toast('이메일과 6자 이상 비밀번호를 입력해 주세요.');
  $('#l-submit').disabled = true;
  try {
    if (S.loginMode === 'up') {
      const family_name = $('#l-family').value.trim(), given_name = $('#l-given').value.trim(), country = $('#l-country').value, birthdate = $('#l-bd').value;
      if (!family_name || !given_name) return toast('성과 이름을 모두 적어 주세요. 크루·친구가 알아볼 수 있게 실명으로 보여요.');
      if (!consent.over14(birthdate)) return toast('만 14세 이상만 가입할 수 있어요. 생년월일을 확인해 주세요.');
      if (!$('#l-agree').checked) return toast('이용약관과 개인정보처리방침에 동의해 주세요.');
      // 생년월일은 서버가 나이만 확인하고 지움(supabase/008)
      const data = ok(await sb.auth.signUp({ email, password, options: { data: { nickname: fullName(family_name, given_name, country), family_name, given_name, country, birthdate, terms_version: consent.TERMS_VER },
        // 초대받은 사람은 확인 메일 링크에도 초대 코드를 실어 다른 브라우저에서 열어도 친구가 되게
        emailRedirectTo: WEB + (lsGet('invite') ? '?f=' + lsGet('invite') : '') } }));
      if (!data.session) toast('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
    } else ok(await sb.auth.signInWithPassword({ email, password }));
  } catch (err) { fail(err); }
  finally { $('#l-submit').disabled = false; }
};
// 비밀번호 찾기: 메일 링크로 돌아오면 PASSWORD_RECOVERY → 새 비밀번호 창
$('#l-forgot').onclick = async () => {
  const email = $('#l-email').value.trim();
  if (!email) return toast('위 칸에 가입한 이메일을 먼저 입력해 주세요.');
  try { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: WEB })); toast('비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러 주세요.'); }
  catch (err) { fail(err); }
};
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') setTimeout(() => $('#pw-reset').showModal());
  const uid = session?.user?.id ?? null;
  if (uid === S.uid) return;
  S.uid = uid;
  // supabase-js 콜백 안에서 바로 쿼리하면 교착될 수 있어 다음 틱으로 미룸
  setTimeout(() => uid ? boot() : showLogin());
});

async function boot() {
  $('#login').hidden = true; $('#app').hidden = false;
  if (!history.state?.godsaeng) guard();
  try {
    await loadCore();
    await consent.loadConsents(); await consent.termsGate();
    initForm();
    show(S.crews.length ? S.tab : 'crew');
    await Promise.all([loadFeed(true), loadMine(), loadBody()]);
    refresh(); if (!S.editing) resetForm();
    await takeShared();
    notif.loadNotifs(); msg.loadMsgs().catch(console.error); msg.listen();
    await friends.acceptInvite();
    if (!lsGet('intro') && !document.querySelector('dialog[open]')) intro(0);
  } catch (err) { fail(err, '불러오지 못했어요. 새로고침해 주세요.'); }
}

// 첫 사용 안내 3장(이 폰에서 처음 한 번만)
const INTRO = [
  ['운동하면 바로 기록', '오른쪽 아래 측정 버튼으로 GPS 기록, 가운데 + 버튼으로 직접 입력해요.'],
  ['크루끼리 약올리기', '랭킹에서 앞선 친구는 견제하고, 누워 있는 친구는 깐족이로 약올려요.'],
  ['친구를 이겨라', '이번 주 1등은 왕관! 반응·댓글 스티커로 서로 응원도 해요.'],
];
let introAt = 0;
function intro(i) {
  introAt = i; const [t, p] = INTRO[i];
  $('#intro-img').src = `img/kk/onboard-${i + 1}.webp`; $('#intro-t').textContent = t; $('#intro-p').textContent = p;
  document.querySelectorAll('.intro-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  $('[data-act="intro-next"]').textContent = i === INTRO.length - 1 ? '시작하기' : '다음';
  if (!$('#intro').open) { $('#intro').showModal(); lsSet('intro', '1'); }   // 한 번 보여 주면 끝(어떻게 닫든)
}

/* 공통 처리: 탭, 세그먼트, data-act 버튼, data-form 폼 */
document.addEventListener('click', async e => {
  const tab = e.target.closest('.tabs [data-tab]');
  if (tab) { if (tab.dataset.tab === 'log' && !S.editing) resetForm(); return show(tab.dataset.tab); }
  const sg = e.target.closest('[data-seg] [data-v]');
  if (sg) { S[sg.closest('[data-seg]').dataset.seg] = sg.dataset.v; return refresh(); }
  const b = e.target.closest('[data-act]'); if (!b || !actions[b.dataset.act]) return;
  const wid = b.closest('[data-wid]')?.dataset.wid, w = [S.feed, S.ppList, S.searchList].flatMap(l => l || []).find(x => x.id === wid);
  try { await actions[b.dataset.act](b, w, e); } catch (err) { b.disabled = false; fail(err); }
  // 프로필 페이지 안에서 반응·팔로우 등을 하면 페이지 다시 그리기
  if (S.pp && b.closest('#pp') && !/^(pp-|profile$|memo-more$)/.test(b.dataset.act)) profile.renderPP();
  if (b.closest('#srch') && !/^(srch-|search-|profile$|memo-more$)/.test(b.dataset.act)) search.rerender();
});
document.addEventListener('submit', async e => {
  const f = e.target, fn = forms[f.dataset.form]; if (!fn) return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  const d = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
  try { await fn(f, d); } catch (err) { fail(err); } finally { if (btn) btn.disabled = false; }
  if (S.pp && f.closest('#pp')) profile.renderPP();
  if (f.closest('#srch')) search.rerender();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.uid && S.me) { notif.loadNotifs(); msg.loadMsgs().catch(console.error); } });

/* 휴대폰 뒤로 가기: 맨 위 것부터 닫음: 열린 창 → 프로필·검색 페이지 → 지나온 탭을 거꾸로 → 피드(홈)
   → 홈에서 누르면 '한 번 더 누르면 종료' → 2초 안에 또 누르면 종료
   앱: 안드로이드 뒤로 가기 버튼을 직접 받음(@capacitor/app). 웹: 주소 기록에 '쉼표' 하나를 두고 popstate 로 받음 */
const guard = () => history.pushState({ godsaeng: 1 }, '');
let exitArmed = null;
function back() {   // 'exit' = 종료, 'armed' = 종료 안내 띄움
  if (!S.uid || !S.me) return 'exit';
  const dlg = [...document.querySelectorAll('dialog[open]')].at(-1);
  const menu = document.querySelector('.pp-menu[open]');
  if (dlg && dlg.id !== 'terms-gate') dlg.close();
  else if (dlg) { /* 약관 동의 창은 뒤로 가기로 못 닫음 */ }
  else if (menu) menu.open = false;
  else if (!$('#pp').hidden) profile.actions['pp-back']();
  else if (!$('#set').hidden) settings.actions['set-close']();
  else if (!$('#trk').hidden) track.actions['trk-close']();
  else if (!$('#msg').hidden) msg.actions['msg-back']();
  else if (!$('#srch').hidden) search.actions['search-close']();
  else if (S.tab !== 'feed') backTab();
  else {
    if (exitArmed) return 'exit';
    $('#exit-hint').hidden = false;
    exitArmed = setTimeout(() => { $('#exit-hint').hidden = true; exitArmed = null; if (!NATIVE) guard(); }, 2000);
    return 'armed';
  }
}
const NATIVE = Capacitor.isNativePlatform();
// 아래 뒤로 가기 버튼 줄은 검정 바탕이라 버튼(아이콘)을 밝게
if (NATIVE) SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.NavigationBar }).catch(() => {});
if (NATIVE) App.addListener('backButton', () => { if (back() === 'exit') App.exitApp(); });
// 웹: 'armed' 면 쉼표를 안 다시 둬서 2초 안에 또 누르면 사이트를 떠남
else addEventListener('popstate', () => { if (S.uid && S.me && !back()) guard(); });

if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('sw.js').catch(() => {});

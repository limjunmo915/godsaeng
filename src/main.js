// 앱 시작: 로그인, 부팅, 공통 클릭·폼 처리
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { S, sb, ok, $ } from './state.js';
import { fillIcons } from './lib/icons.js';
import { toast, fail, lsGet, lsSet } from './lib/util.js';
import { loadCore, loadFeed, loadMine, loadBody } from './lib/data.js';
import { show, refresh } from './nav.js';
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
import { initForm, resetForm } from './screens/log.js';

const actions = { ...feed.actions, ...rank.actions, ...crew.actions, ...me.actions, ...body.actions, ...notif.actions, ...report.actions, ...consent.actions, ...friends.actions, ...profile.actions, ...search.actions,
  go: b => { if (b.dataset.tab === 'log') resetForm(); show(b.dataset.tab); } };
const forms = {
  newpw: async (f, d) => {
    if (d.pw.length < 6) return toast('6자 이상 입력해 주세요.');
    ok(await sb.auth.updateUser({ password: d.pw })); $('#pw-reset').close(); toast('비밀번호를 바꿨어요');
  },
  ...feed.forms, ...crew.forms, ...me.forms, ...body.forms, ...report.forms, ...consent.forms };

fillIcons();
// 친구 초대 링크(?f=코드): 저장해 두고 주소창에서 지움 → 로그인 뒤 friends.acceptInvite()
{ const f = new URLSearchParams(location.search).get('f');
  if (f) { lsSet('invite', f); history.replaceState(null, '', location.pathname); $('#l-invited').hidden = false; } }
$('#terms-gate').addEventListener('cancel', e => e.preventDefault());  // Esc 로 닫고 넘어가지 못하게

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
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const email = $('#l-email').value.trim(), password = $('#l-pw').value;
  if (!email || password.length < 6) return toast('이메일과 6자 이상 비밀번호를 입력해 주세요.');
  $('#l-submit').disabled = true;
  try {
    if (S.loginMode === 'up') {
      const nickname = $('#l-nick').value.trim() || email.split('@')[0], birthdate = $('#l-bd').value;
      if (!consent.over14(birthdate)) return toast('만 14세 이상만 가입할 수 있어요. 생년월일을 확인해 주세요.');
      if (!$('#l-agree').checked) return toast('이용약관과 개인정보처리방침에 동의해 주세요.');
      // 생년월일은 서버가 나이만 확인하고 지움(supabase/008)
      const data = ok(await sb.auth.signUp({ email, password, options: { data: { nickname, birthdate, terms_version: consent.TERMS_VER },
        // 초대받은 사람은 확인 메일 링크에도 초대 코드를 실어 다른 브라우저에서 열어도 친구가 되게
        emailRedirectTo: location.origin + location.pathname + (lsGet('invite') ? '?f=' + lsGet('invite') : '') } }));
      if (!data.session) toast('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
    } else ok(await sb.auth.signInWithPassword({ email, password }));
  } catch (err) { fail(err); }
  finally { $('#l-submit').disabled = false; }
};
// 비밀번호 찾기: 메일 링크로 돌아오면 PASSWORD_RECOVERY → 새 비밀번호 창
$('#l-forgot').onclick = async () => {
  const email = $('#l-email').value.trim();
  if (!email) return toast('위 칸에 가입한 이메일을 먼저 입력해 주세요.');
  try { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); toast('비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러 주세요.'); }
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
    notif.loadNotifs();
    await friends.acceptInvite();
  } catch (err) { fail(err, '불러오지 못했어요. 새로고침해 주세요.'); }
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
  if (S.pp && b.closest('#pp') && !/^(pp-|profile$)/.test(b.dataset.act)) profile.renderPP();
  if (b.closest('#srch') && !/^(srch-|search-|profile$)/.test(b.dataset.act)) search.rerender();
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.uid && S.me) notif.loadNotifs(); });

/* 휴대폰 뒤로 가기: 앱은 화면만 바꾸고 주소 기록을 안 남겨서 바로 꺼짐 → 기록에 '쉼표' 하나를 두고
   뒤로 가기마다 맨 위 것부터 닫음: 열린 창 → 프로필·검색 페이지 → 피드가 아닌 탭 → (피드에서) 한 번 더 누르면 종료 */
const guard = () => history.pushState({ godsaeng: 1 }, '');
let exitArmed = null;
addEventListener('popstate', () => {
  if (!S.uid || !S.me) return;
  const dlg = [...document.querySelectorAll('dialog[open]')].at(-1);
  const menu = document.querySelector('.pp-menu[open]');
  if (dlg && dlg.id !== 'terms-gate') dlg.close();
  else if (dlg) { /* 약관 동의 창은 뒤로 가기로 못 닫음 */ }
  else if (menu) menu.open = false;
  else if (!$('#pp').hidden) profile.actions['pp-back']();
  else if (!$('#srch').hidden) search.actions['search-close']();
  else if (S.tab !== 'feed') show('feed');
  else {
    // 피드(홈)에서: 2초 안에 한 번 더 누르면 기록이 없어 앱이 닫힘
    if (exitArmed) return;
    $('#exit-hint').hidden = false;
    exitArmed = setTimeout(() => { $('#exit-hint').hidden = true; exitArmed = null; guard(); }, 2000);
    return;
  }
  guard();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

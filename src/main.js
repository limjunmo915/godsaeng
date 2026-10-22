// 앱 시작: 로그인, 부팅, 공통 클릭·폼 처리
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { S, sb, ok, $ } from './state.js';
import { fillIcons } from './lib/icons.js';
import { toast, fail } from './lib/util.js';
import { loadCore, loadFeed, loadMine, loadBody } from './lib/data.js';
import { show, refresh } from './nav.js';
import * as feed from './screens/feed.js';
import * as rank from './screens/rank.js';
import * as crew from './screens/crew.js';
import * as me from './screens/me.js';
import * as body from './screens/body.js';
import * as notif from './screens/notif.js';
import { initForm, resetForm } from './screens/log.js';

const actions = { ...feed.actions, ...rank.actions, ...crew.actions, ...me.actions, ...body.actions, ...notif.actions,
  go: b => { if (b.dataset.tab === 'log') resetForm(); show(b.dataset.tab); } };
const forms = { ...feed.forms, ...crew.forms, ...me.forms, ...body.forms };

fillIcons();

/* 로그인 */
const showLogin = () => { $('#app').hidden = true; $('#login').hidden = false; };
$('#l-toggle').onclick = () => {
  S.loginMode = S.loginMode === 'in' ? 'up' : 'in';
  const up = S.loginMode === 'up';
  $('#l-nick-wrap').hidden = !up;
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
      const nickname = $('#l-nick').value.trim() || email.split('@')[0];
      const data = ok(await sb.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: location.origin + location.pathname } }));
      if (!data.session) toast('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
    } else ok(await sb.auth.signInWithPassword({ email, password }));
  } catch (err) { fail(err); }
  finally { $('#l-submit').disabled = false; }
};
sb.auth.onAuthStateChange((_ev, session) => {
  const uid = session?.user?.id ?? null;
  if (uid === S.uid) return;
  S.uid = uid;
  // supabase-js 콜백 안에서 바로 쿼리하면 교착될 수 있어 다음 틱으로 미룸
  setTimeout(() => uid ? boot() : showLogin());
});

async function boot() {
  $('#login').hidden = true; $('#app').hidden = false;
  try {
    await loadCore();
    initForm();
    show(S.crews.length ? S.tab : 'crew');
    await Promise.all([loadFeed(true), loadMine(), loadBody()]);
    refresh(); if (!S.editing) resetForm();
    notif.loadNotifs();
  } catch (err) { fail(err, '불러오지 못했어요. 새로고침해 주세요.'); }
}

/* 공통 처리: 탭, 세그먼트, data-act 버튼, data-form 폼 */
document.addEventListener('click', async e => {
  const tab = e.target.closest('.tabs [data-tab]');
  if (tab) { if (tab.dataset.tab === 'log' && !S.editing) resetForm(); return show(tab.dataset.tab); }
  const sg = e.target.closest('[data-seg] [data-v]');
  if (sg) { S[sg.closest('[data-seg]').dataset.seg] = sg.dataset.v; return refresh(); }
  const b = e.target.closest('[data-act]'); if (!b || !actions[b.dataset.act]) return;
  const w = S.feed.find(x => x.id === b.closest('[data-wid]')?.dataset.wid);
  try { await actions[b.dataset.act](b, w, e); } catch (err) { b.disabled = false; fail(err); }
});
document.addEventListener('submit', async e => {
  const f = e.target, fn = forms[f.dataset.form]; if (!fn) return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  const d = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
  try { await fn(f, d); } catch (err) { fail(err); } finally { if (btn) btn.disabled = false; }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.uid && S.me) notif.loadNotifs(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

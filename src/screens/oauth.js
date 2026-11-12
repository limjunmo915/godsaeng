// 카카오·구글 간편 로그인(Supabase Auth). 설정 순서: 기획문서/13_간편_로그인.md
// 앱: 구글은 앱 안 화면(WebView)에서 로그인을 막아서 휴대폰 브라우저로 열고, 끝나면 com.godsaeng.app://auth 로 앱에 돌아옴
// 웹: 그 페이지에서 바로 다녀옴(supabase-js 가 주소의 토큰을 알아서 읽음)
// 간편 가입한 사람은 생년월일·약관·실명을 받지 않았으므로 첫 화면에서 '약관 동의' 창이 그걸 받음(consent.js termsGate)
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { sb, ok, WEB } from '../state.js';
import { toast, fail } from '../lib/util.js';

// Supabase 대시보드에서 켠 것만(켜지 않은 걸 누르면 오류 화면이 나옴). 사용자가 켜면 여기에 추가
export const PROVIDERS = ['kakao', 'google'];
const NATIVE = Capacitor.isNativePlatform(), BACK = 'com.godsaeng.app://auth';

export async function signInWith(provider) {
  const { url } = ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: NATIVE ? BACK : WEB, skipBrowserRedirect: NATIVE } }));
  if (NATIVE) await Browser.open({ url, presentationStyle: 'popover' });
}

// 앱: 브라우저에서 로그인을 마치면 com.godsaeng.app://auth#access_token=…&refresh_token=… 로 돌아옴
if (NATIVE) App.addListener('appUrlOpen', async ({ url }) => {
  if (!url?.startsWith(BACK)) return;
  Browser.close().catch(() => {});
  const p = new URLSearchParams(url.split('#')[1] || url.split('?')[1] || '');
  if (p.get('error')) return toast(p.get('error_description') || '로그인하지 못했어요');
  try { ok(await sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') })); }
  catch (err) { fail(err, '로그인하지 못했어요. 다시 시도해 주세요.'); }
});

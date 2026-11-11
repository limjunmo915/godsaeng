// 휴대폰 푸시 알림(안드로이드 앱만, supabase/019 + functions/push). 반응·댓글·약올리기·팔로우·메시지·함께한 운동
// 앱이 켜져 있을 땐 알림창에 안 뜨고(화면 안 깐족이·빨간 점이 대신함), 꺼져 있거나 뒤에 있을 때만 뜸
// 기기 토큰은 로그인한 계정에 묶어 서버에 저장하고, 끄거나 로그아웃하면 지움
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { sb, $ } from '../state.js';
import { lsGet, lsSet } from '../lib/util.js';
import { goToWorkout } from './feed.js';
import { openProfile } from './profile.js';
import { actions as msgActions } from './msg.js';
import { actions as notifActions } from './notif.js';

// __PUSH__: 빌드할 때 android/app/google-services.json(Firebase 설정 파일)이 있으면 true(vite.config.js). 없이 등록하면 앱이 죽음
export const pushReady = () => Capacitor.isNativePlatform() && __PUSH__;
export const pushOn = () => lsGet('push') !== 'off';

// 알림을 눌러 들어왔을 때: 기록 / 프로필 / 대화방 / 알림함
function go(d) {
  document.querySelectorAll('dialog[open]:not(#terms-gate)').forEach(x => x.close());
  if (d.w) return goToWorkout(d.w);
  if (d.uid) return openProfile(d.uid);
  if (d.chat) return msgActions['msg-open']({ dataset: { k: d.chat } });
  return notifActions.notif();
}

let wired = false, pending = null;
function wire() {
  if (wired) return; wired = true;
  PushNotifications.addListener('registration', t => { lsSet('pushTok', t.value); sb.rpc('save_push_token', { tok: t.value }).then(({ error }) => error && console.error(error)); });
  PushNotifications.addListener('registrationError', e => console.error('push', e));
  PushNotifications.addListener('pushNotificationActionPerformed', a => {
    const d = a.notification?.data || {};
    if ($('#app').hidden) pending = d; else Promise.resolve(go(d)).catch(console.error);   // 아직 로그인·불러오기 전이면 끝난 뒤에
  });
}

// 앱을 열 때마다: 권한을 묻고(처음 한 번), 토큰을 서버에 맞춤. ask=false 면 이미 허용한 경우만
export async function initPush(ask = true) {
  if (!pushReady() || !pushOn()) return false;
  wire();
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted' && ask) p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') return false;
  await PushNotifications.createChannel({ id: 'social', name: '반응·댓글·약올리기·메시지', importance: 4 });
  await PushNotifications.register();
  if (pending) { const d = pending; pending = null; Promise.resolve(go(d)).catch(console.error); }
  return true;
}
// 끄기·로그아웃: 이 기기 토큰을 서버에서 지움(다른 사람 알림이 이 폰에 오지 않게)
export async function dropPush() {
  if (!pushReady()) return;
  const tok = lsGet('pushTok');
  if (tok) await sb.from('push_tokens').delete().eq('token', tok).then(() => {}, () => {});
  lsSet('pushTok', '');
}
export async function setPush(on) {
  lsSet('push', on ? 'on' : 'off');
  if (!on) { await dropPush(); return PushNotifications.unregister().catch(() => {}); }
  if (!await initPush()) { lsSet('push', 'off'); throw new Error('알림 권한이 꺼져 있어요. 휴대폰 설정 → 앱 → 갓생살기 → 알림에서 허용해 주세요.'); }
}

// 워치 자동 올리기(안드로이드 앱만): 워치로 운동을 끝내면 15분 안에 폰이 알아서 올리고 '기록 올리기 성공' 알림
// 실제 확인·올리기는 앱 안 플러그인 AutoSync(android/.../SyncWorker.kt) 가 앱이 꺼져 있어도 함. 서버는 supabase/016
// 여기서는 켜기(권한·기기 열쇠)·끄기, 앱을 열 때 '자동으로 올라갔어요' 팝업과 알림을 눌러 들어온 기록의 수정 화면만
import { Capacitor, registerPlugin } from '@capacitor/core';
import { S, sb, ok, $, SUPA_URL, SUPA_ANON } from '../state.js';
import { lsGet, lsSet, toast, pop } from '../lib/util.js';
import { kkTease } from '../lib/icons.js';
import { loadFeed, loadMine } from '../lib/data.js';
import { refresh } from '../nav.js';
import { editWorkout } from './log.js';

const AutoSync = registerPlugin('AutoSync');
export const autoReady = () => Capacitor.isNativePlatform();
export const autoOn = () => lsGet('autoUp') === 'on';

// 켜기: Health Connect 권한(앱이 꺼져 있을 때 읽기 포함) → 알림 권한 → 기기 열쇠 발급 → 15분마다 확인 시작
export async function enableAuto() {
  const { background } = await AutoSync.requestBackground();
  await AutoSync.requestNotifications();
  const dkey = ok(await sb.rpc('register_device', { vis: lsGet('defVis') === 'private' ? 'private' : 'crew' }));
  await AutoSync.enable({ url: SUPA_URL, anon: SUPA_ANON, dkey });
  lsSet('autoUp', 'on');
  if (!background) toast('"앱을 사용하지 않을 때도 읽기"를 허용해야 앱을 안 열어도 올라가요. 지금은 앱을 열 때 올라가요');
  return background;
}
export async function disableAuto() {
  await AutoSync.disable(); lsSet('autoUp', 'off');
  await sb.from('device_keys').delete().eq('user_id', S.uid);   // 이 계정의 기기 열쇠를 지워 서버에서도 바로 막음
}

// 앱을 열 때: 처음이면 안내 창, 켜져 있으면 지금 한 번 확인 + 자동으로 올라간 기록 팝업 + 알림 눌러 들어왔으면 수정 화면
export async function checkAuto() {
  if (!autoReady() || !S.uid) return;
  if (lsGet('autoUp') == null) { if (!$('#auto-dlg').open) $('#auto-dlg').showModal(); return; }
  if (!autoOn()) return;
  AutoSync.runNow().catch(() => {});
  const { tap, uploaded } = await AutoSync.take();
  if (!tap && !uploaded?.length) return;
  await Promise.all([loadFeed(true), loadMine()]); refresh();
  const id = tap || uploaded.at(-1), w = S.feed.find(x => x.id === id);   // 수정 화면엔 피드 기록(공개 범위 등 다 있음)
  if (tap && w) return editWorkout(w);
  if (uploaded?.length) {
    pop(kkTease(), null, `워치 운동 ${uploaded.length}개가 자동으로 올라갔어요`);
    if (w) setTimeout(() => { if (confirm('방금 올라간 기록에 사진·한마디를 더할까요?')) editWorkout(w); }, 1800);
  }
}

export const actions = {
  'auto-on': async () => {
    $('#auto-dlg').close();
    try { await enableAuto(); toast('켰어요! 워치로 운동을 끝내면 15분 안에 자동으로 올라가요'); }
    catch (err) { lsSet('autoUp', 'off'); toast('켜지 못했어요. 설정에서 다시 켤 수 있어요'); console.error(err); }
  },
  'auto-later': () => { $('#auto-dlg').close(); lsSet('autoUp', 'off'); toast('설정 → 워치·센서에서 언제든 켤 수 있어요'); },
};

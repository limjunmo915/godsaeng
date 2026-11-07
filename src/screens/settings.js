// 설정(홈 오른쪽 위 톱니): 프로필 · 공개 범위 · 측정 · 워치 · 알림 · 건강정보 · 도움말 · 계정
// 스트라바·나이키 런클럽·카카오톡 설정을 참고해 자주 쓰는 것만. 폰마다 다른 값(음성 안내 등)은 이 폰에 기억
import { Capacitor } from '@capacitor/core';
import { S, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, lsGet, lsSet, toast, COUNTRIES } from '../lib/util.js';
import { avatar, nameOf } from '../lib/calc.js';
import { autoOn, enableAuto, disableAuto } from './autosync.js';

const on = (k, def = true) => (lsGet(k) ?? (def ? 'on' : 'off')) !== 'off';
const sw = (k, label, hint, def = true) => `<label class="set-sw"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-pref="${k}" ${on(k, def) ? 'checked' : ''}></label>`;
const link = (act, icon, label) => `<button type="button" class="set-row" data-act="${act}">${ic(icon)}<span>${label}</span>${ic('chevron-right')}</button>`;
const page = (href, icon, label) => `<a class="set-row" href="${href}" target="_blank" rel="noopener">${ic(icon)}<span>${label}</span>${ic('chevron-right')}</a>`;

export function renderSettings() {
  const me = S.me, native = Capacitor.isNativePlatform(), priv = lsGet('defVis') === 'private';
  $('#set-body').innerHTML = `<header class="pp-top"><button class="icbtn" data-act="set-close" aria-label="닫기">${ic('chevron-left')}</button><h2>설정</h2></header>
    <h3 class="set-h">프로필</h3>
    <div class="avatar-row">${avatar(S.uid, 'lg')}
      <label class="btn">${ic('camera')}사진 바꾸기<input type="file" id="avatar-file" accept="image/*" hidden></label>
      ${me.avatar_url ? '<button class="btn" data-act="avatar-del">사진 빼기</button>' : ''}</div>
    <form class="stack" data-form="settings">
      <div class="row">
        <label class="field"><span>성</span><input type="text" name="family" maxlength="20" value="${esc(me.family_name || '')}"></label>
        <label class="field"><span>이름</span><input type="text" name="given" maxlength="30" value="${esc(me.given_name || '')}"></label>
        <label class="field"><span>나라</span><select name="country">${COUNTRIES.map(([k, v]) => `<option value="${k}" ${k === (me.country || 'KR') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      ${me.family_name ? '' : `<label class="field"><span>닉네임 (성·이름을 넣으면 실명으로 바뀌어요)</span><input type="text" name="nick" maxlength="20" value="${esc(me.nickname)}"></label>`}
      <div class="row">
        <label class="field"><span>주간 목표 (분)</span><input type="number" name="goal" min="0" max="5000" value="${me.weekly_goal_min}"></label>
        <label class="field"><span>한 줄 소개</span><input type="text" name="bio" maxlength="40" value="${esc(me.bio || '')}" placeholder="주 3회 5km 목표!"></label>
      </div>
      <p class="hint">활동 지역(${esc(me.region || '아직 없음')})은 GPS로 기록한 운동에서 가장 많이 운동한 나라·도시로 자동으로 정해져요.</p>
      <h3 class="set-h">공개 범위·개인정보</h3>
      <label class="set-sw"><span><b>약올리기 받기</b><small>끄면 크루원·친구가 나를 약올릴 수 없어요</small></span><input type="checkbox" name="poke_on" ${me.poke_off ? '' : 'checked'}></label>
      <label class="set-sw"><span><b>검색에 나 표시</b><small>끄면 이름 검색에 안 나와요</small></span><input type="checkbox" name="searchable" ${me.searchable === false ? '' : 'checked'}></label>
      ${'together_off' in me ? `<label class="set-sw"><span><b>함께한 운동 자동으로 찾기</b><small>같은 시간에 경로가 겹치거나 같은 곳에서 같은 운동을 한 크루원·친구를 '함께'로 보여 줘요</small></span><input type="checkbox" name="tg_on" ${me.together_off ? '' : 'checked'}></label>` : ''}
      <button class="btn primary">프로필·공개 범위 저장</button>
    </form>
    <label class="field set-gap"><span>새 기록 기본 공개 범위</span><select data-pref-sel="defVis"><option value="crew" ${priv ? '' : 'selected'}>크루·친구 공개</option><option value="private" ${priv ? 'selected' : ''}>나만 보기</option></select></label>
    ${S.blocked.length ? `<p class="set-sub">차단한 사람</p>${S.blocked.map(id => `<div class="blk">${avatar(id, 'sm')}<span>${esc(nameOf(id))}</span><button class="linkbtn" data-act="unblock" data-id="${id}">차단 풀기</button></div>`).join('')}` : ''}

    <h3 class="set-h">측정</h3>
    ${sw('voice', '음성 안내', '1km마다(시간만 종목은 10분마다) 알려 줘요')}
    ${sw('countdown', '시작 전 3·2·1 카운트다운')}
    ${sw('autopause', '자동 일시정지', '10초 넘게 멈추면 기록을 잠깐 멈춰요(GPS 종목)')}

    ${native ? `<h3 class="set-h">워치·센서</h3>
    <label class="set-sw"><span><b>워치 자동 올리기</b><small>워치로 운동을 끝내면 15분 안에 자동으로 올리고 '기록 올리기 성공' 알림</small></span><input type="checkbox" id="auto-sw" ${autoOn() ? 'checked' : ''}></label>
    ${link('watch-open', 'activity', '워치·삼성 헬스에서 기록 불러오기')}
    ${link('hc-settings', 'settings', 'Health Connect 권한 관리')}
    <p class="hint">심박 센서는 측정 화면 오른쪽 위 심박 버튼으로 연결해요.</p>` : ''}

    <h3 class="set-h">알림</h3>
    <p class="hint">휴대폰 알림(반응·댓글·약올림)은 곧 나와요. 지금은 위쪽 종에서 확인해요.</p>

    <h3 class="set-h">위치정보</h3>
    <div class="consent-row"><span>운동 경로 저장 동의 ${S.consents.location ? '함' : '안 함'}</span>${S.consents.location
      ? '<button class="linkbtn danger" data-act="loc-withdraw">동의 철회</button>' : '<button class="linkbtn" data-act="loc-on">동의하기</button>'}</div>
    <p class="hint">동의하면 GPS로 잰 경로가 저장돼 크루·친구 피드에 경로 그림으로 보여요(출발·도착 200m는 잘라내요). 철회하면 저장된 경로를 모두 지워요.</p>

    <h3 class="set-h">건강정보</h3>
    <div class="consent-row"><span>건강정보(심박·신체 기록) 동의 ${S.consents.health ? '함' : '안 함'}</span>${S.consents.health
      ? '<button class="linkbtn danger" data-act="health-withdraw">동의 철회</button>' : '<button class="linkbtn" data-act="health-agree">동의하기</button>'}</div>

    <h3 class="set-h">도움말·정보</h3>
    ${link('notif', 'bell', '공지사항·알림')}
    ${link('feedback', 'bulb', '건의·버그 제보')}
    ${page('terms.html', 'lock', '이용약관')}
    ${page('privacy.html', 'lock', '개인정보처리방침')}
    ${page('location-terms.html', 'current-location', '위치기반서비스 이용약관')}
    ${page('licenses.html', 'copy', '오픈소스 라이선스')}

    <h3 class="set-h">계정</h3>
    <button class="btn wide danger" data-act="logout">${ic('logout')}로그아웃</button>
    <button class="linkbtn danger center" data-act="delete-me">탈퇴하기</button>`;
}

// 이 폰에 기억하는 설정은 누르는 즉시 저장
document.addEventListener('change', async e => {
  if (e.target.id === 'auto-sw') {
    try { if (e.target.checked) { await enableAuto(); toast('켰어요! 워치 운동이 자동으로 올라가요'); } else { await disableAuto(); toast('껐어요'); } }
    catch (err) { e.target.checked = !e.target.checked; toast('바꾸지 못했어요. 권한을 확인해 주세요'); console.error(err); }
    return;
  }
  const k = e.target.dataset?.pref; if (k) { lsSet(k, e.target.checked ? 'on' : 'off'); return toast('저장했어요'); }
  const s = e.target.dataset?.prefSel; if (s) { lsSet(s, e.target.value); toast('저장했어요'); }
});

export const actions = {
  'set-open': () => { renderSettings(); $('#set').hidden = false; $('#set').scrollTo(0, 0); document.body.classList.add('pp-open'); },
  'set-close': () => { $('#set').hidden = true; if (!document.querySelector('.pp:not([hidden])')) document.body.classList.remove('pp-open'); },
  'hc-settings': async () => { const { Health } = await import('capacitor-health'); Health.openHealthConnectSettings().catch(() => toast('Health Connect 를 열 수 없어요')); },
};

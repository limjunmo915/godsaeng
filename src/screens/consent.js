// 약관·건강정보 동의 (supabase/008). 약관이 바뀌면 TERMS_VER 를 올리고 privacy.html·terms.html 변경 이력에 추가
import { S, sb, ok, $ } from '../state.js';
import { toast } from '../lib/util.js';
import { loadBody, loadMine } from '../lib/data.js';
import { refresh } from '../nav.js';

export const TERMS_VER = '2026-10-25', HEALTH_VER = '2026-10-25';

// 만 나이 14세 이상인가 (생년월일 'YYYY-MM-DD')
export function over14(bd) {
  const d = new Date(bd + 'T00:00'), t = new Date();
  if (isNaN(d)) return false;
  const passed = t.getMonth() > d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() >= d.getDate());
  return t.getFullYear() - d.getFullYear() - (passed ? 0 : 1) >= 14;
}

export async function loadConsents() {
  S.consents = Object.fromEntries(ok(await sb.from('consents').select('kind,version')).map(c => [c.kind, c.version]));
}

// 약관 동의 창: 기존 회원(처음 1번)이나 약관이 바뀌었을 때. 동의해야 앱을 계속 씀
let gateDone;
export function termsGate() {
  if (S.consents.terms === TERMS_VER) return;
  $('#t-bd-wrap').hidden = !!S.consents.terms;   // 처음 동의하는 사람만 나이 확인
  $('#terms-gate').showModal();
  return new Promise(r => { gateDone = r; });
}

export const HEALTH_TEXT = '건강정보(민감정보) 수집·이용 동의\n\n'
  + '· 항목: 평균 심박, 출생연도·성별·키, 체중·체지방률·골격근량·허리둘레·안정시 심박\n'
  + '· 목적: 칼로리 계산, 신체 변화 추이\n'
  + '· 보관: 동의 철회 또는 탈퇴 시 즉시 삭제\n'
  + '· 광고·마케팅에 절대 쓰지 않아요\n\n'
  + '동의하지 않아도 다른 기능은 모두 쓸 수 있어요(심박 입력·내 몸 탭만 제한).';

export async function agreeHealth(ask = true) {
  if (ask && !confirm(HEALTH_TEXT + '\n\n동의할까요?')) return false;
  ok(await sb.from('consents').upsert({ user_id: S.uid, kind: 'health', version: HEALTH_VER }));
  S.consents.health = HEALTH_VER;
  return true;
}

export const actions = {
  'health-agree': async b => { if (await agreeHealth(!b.dataset.noask)) { toast('동의했어요'); return refresh(); } },
  // 철회: 신체 기록·기본 정보·운동 기록의 평균 심박을 지우고 동의 기록 삭제
  'health-withdraw': async () => {
    if (!confirm('건강정보 동의를 철회할까요?\n신체 기록, 출생연도·성별·키, 모든 운동 기록의 평균 심박이 바로 지워지고 되돌릴 수 없어요.')) return;
    ok(await sb.from('body_logs').delete().eq('user_id', S.uid));
    ok(await sb.from('body_profile').delete().eq('user_id', S.uid));
    ok(await sb.from('workouts').update({ avg_hr: null }).eq('user_id', S.uid).not('avg_hr', 'is', null));
    ok(await sb.from('consents').delete().eq('user_id', S.uid).eq('kind', 'health'));
    delete S.consents.health;
    await Promise.all([loadBody(), loadMine()]);
    toast('철회하고 건강정보를 지웠어요'); return refresh();
  },
};

export const forms = {
  terms: async (f, d) => {
    if (!d.agree) return toast('동의해야 계속 쓸 수 있어요.');
    if (!S.consents.terms && !over14(d.birthdate)) return toast('만 14세 이상만 이용할 수 있어요.');
    ok(await sb.rpc('agree_terms', { ver: TERMS_VER, birthdate: S.consents.terms ? null : d.birthdate }));
    S.consents.terms = TERMS_VER;
    $('#terms-gate').close(); gateDone?.();
  },
};

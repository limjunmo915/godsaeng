// 건의·버그 제보·신고 보내기 (feedback 표, supabase/005). 운영자는 대시보드에서 확인
import { S, sb, ok, $ } from '../state.js';
import { refresh } from '../nav.js';
import { toast } from '../lib/util.js';
import { nameOf } from '../lib/calc.js';

// 신고면 대상 정보를 숨은 칸에 담아 같은 창을 씀
function open(report) {
  const f = $('#fb-form'); f.reset();
  for (const k of ['workout_id', 'comment_id', 'target_user', 'snapshot']) f.elements[k].value = report?.[k] || '';
  f.elements.mode.value = report ? 'report' : 'feedback';
  $('#fb-title').textContent = report ? `${nameOf(report.target_user)}님의 ${report.comment_id ? '댓글' : '기록'} 신고` : '건의·버그 제보';
  $('#fb-kind').hidden = !!report; $('#fb-reason').hidden = !report;
  $('#fb-block').hidden = $('#fb-block-only').hidden = !report || S.blocked.includes(report.target_user);
  f.elements.body.placeholder = report ? '자세한 내용 (선택)' : '불편한 점, 바라는 기능, 버그 상황을 적어 주세요';
  $('#fb').showModal();
}

// 차단(supabase/007): 서로 약올리기·댓글·반응 불가, 내 화면에서 상대 기록·댓글·약올리기 숨김
async function block(id) {
  ok(await sb.from('blocks').upsert({ blocker: S.uid, blocked: id }));
  if (!S.blocked.includes(id)) S.blocked.push(id);
}

export const actions = {
  block: async () => {
    const id = $('#fb-form').elements.target_user.value;
    if (!confirm(`${nameOf(id)}님을 차단할까요?
서로 약올리기·댓글·반응을 할 수 없고, 상대 기록이 내 피드에서 사라져요. 설정에서 언제든 풀 수 있어요.`)) return;
    await block(id); $('#fb').close(); toast('차단했어요'); return refresh();
  },
  unblock: async b => {
    ok(await sb.from('blocks').delete().eq('blocker', S.uid).eq('blocked', b.dataset.id));
    S.blocked = S.blocked.filter(x => x !== b.dataset.id); toast('차단을 풀었어요'); return refresh();
  },
  feedback: () => open(),
  report: (b, w) => open({ workout_id: w.id, target_user: w.user_id,
    snapshot: [w.title, w.brag, w.memo, w.photos.length ? `사진 ${w.photos.length}장` : ''].filter(Boolean).join(' / ').slice(0, 1000) }),
  'report-cm': (b, w) => { const c = w.comments.find(x => x.id === b.dataset.cid);
    open({ workout_id: w.id, comment_id: c.id, target_user: c.user_id, snapshot: c.body }); },
  'close-fb': () => $('#fb').close(),
};

export const forms = {
  feedback: async (f, d) => {
    const report = d.mode === 'report';
    const body = report ? [d.reason, d.body].filter(Boolean).join('\n') : d.body;
    if (!body) return toast('내용을 적어 주세요.');
    ok(await sb.from('feedback').insert({ kind: report ? 'report' : d.kind, body,
      workout_id: d.workout_id || null, comment_id: d.comment_id || null, target_user: d.target_user || null, snapshot: d.snapshot || null }));
    if (report && d.block) await block(d.target_user);
    $('#fb').close();
    toast(report ? `신고를 접수했어요.${d.block ? ' 차단도 했어요.' : ''} 확인 후 조치할게요.` : '보내 주셔서 고마워요!');
    if (d.block) return refresh();
  },
};

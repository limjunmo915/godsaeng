// 푸시 알림 보내기(Supabase Edge Function, 이름: push). SQL 019 가 알림 대기열(push_queue)에 줄을 넣으면 이 함수를 깨움
// 받은 요청 내용은 안 믿고, 대기열을 비우며 받는 사람 기기로 FCM 알림을 보냄 → 누가 불러도 '대기열 비우기'만 일어남
// 비밀 값(사용자가 Supabase 대시보드 Edge Functions → Secrets 에 직접 넣음): FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 전체
// SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 함수 안에 자동으로 넣어 주는 값(밖으로 나가지 않음)
import { createClient } from 'npm:@supabase/supabase-js@2';

const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// 구글 접근 토큰(1시간짜리): 서비스 계정 열쇠로 서명한 JWT 를 토큰으로 바꿈. 50분 동안 다시 씀
const b64u = (b: ArrayBuffer | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let cached = { token: '', exp: 0 };
async function accessToken() {
  if (cached.exp > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${sig}` });
  const j = await r.json(); if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + 50 * 60000 };
  return cached.token;
}

Deno.serve(async () => {
  if (!sa.private_key) return new Response('FCM_SERVICE_ACCOUNT 비밀 값이 없어요', { status: 500 });
  // 대기열에서 꺼내면서 지움(두 번 보내지 않게). 실패한 알림은 다시 안 보냄(알림은 놓쳐도 앱 안 알림함에 남음)
  const { data: rows, error } = await db.from('push_queue').delete().lte('created_at', new Date().toISOString()).select();
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) return new Response('0');
  const { data: toks } = await db.from('push_tokens').select('token,user_id').in('user_id', [...new Set(rows.map(r => r.user_id))]);
  const token = await accessToken();
  let sent = 0; const dead: string[] = [];
  await Promise.all(rows.flatMap(r => (toks ?? []).filter(t => t.user_id === r.user_id).map(async t => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: t.token, notification: { title: '갓생살기', body: r.body },
        data: Object.fromEntries(Object.entries(r.data ?? {}).map(([k, v]) => [k, String(v)])),   // FCM data 는 글자만
        android: { priority: 'HIGH', notification: { channel_id: 'social', ...(r.tag ? { tag: r.tag } : {}) } } } }),
    });
    if (res.ok) sent++; else if (res.status === 404 || res.status === 400) dead.push(t.token);   // 앱을 지웠거나 못 쓰는 토큰
    else console.error('fcm', res.status, await res.text());
  })));
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  return new Response(String(sent));
});

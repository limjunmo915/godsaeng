-- 016: 워치 자동 올리기(11-05). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 앱이 꺼져 있을 때 폰(안드로이드)이 15분마다 Health Connect 를 확인해 새 운동을 직접 올림.
-- 로그인 열쇠(토큰)를 백그라운드와 같이 쓰면 로그아웃될 수 있어서, 폰마다 '기기 열쇠'를 따로 발급(해시만 저장)하고
-- 그 열쇠로만 auto_upload() 를 부를 수 있게 함. 설정에서 끄면 열쇠를 지워 바로 막힘
create extension if not exists pgcrypto with schema extensions;

-- 같은 워치 운동이 두 번 안 올라가게: 워치(Health Connect) 기록 id
alter table workouts add column if not exists ext_id text check (char_length(ext_id) <= 100);
create unique index if not exists workouts_user_ext on workouts (user_id, ext_id) where ext_id is not null;

create table if not exists device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  key_hash text not null unique,
  visibility text not null default 'crew' check (visibility in ('crew', 'private')),
  created_at timestamptz not null default now(),
  last_used timestamptz
);
alter table device_keys enable row level security;
drop policy if exists dk_own on device_keys;
create policy dk_own on device_keys for select to authenticated using (user_id = auth.uid());
drop policy if exists dk_del on device_keys;
create policy dk_del on device_keys for delete to authenticated using (user_id = auth.uid());

-- 기기 열쇠 발급: 열쇠 원문은 이때 한 번만 폰에 돌려주고 서버엔 해시만. vis = 자동으로 올릴 때 공개 범위
create or replace function register_device(vis text default 'crew') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into device_keys (user_id, key_hash, visibility)
    values (auth.uid(), encode(digest(k, 'sha256'), 'hex'), case when vis = 'private' then 'private' else 'crew' end);
  return k;
end $$;
revoke all on function register_device(text) from public, anon;
grant execute on function register_device(text) to authenticated;

-- 자동 올리기(로그인 없이 기기 열쇠로): 값 범위를 서버가 다시 확인하고, 이미 올린 워치 운동이면 그 기록 id 를 돌려줌
-- w: { ext_id, type, title, started_at, duration_min, distance_km, kcal, avg_hr }, route: encoded polyline(위치 동의한 사람만 저장)
create or replace function auto_upload(dkey text, w jsonb, route text default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare d device_keys; wid uuid; mins numeric := (w->>'duration_min')::numeric; km numeric := coalesce((w->>'distance_km')::numeric, 0);
begin
  select * into d from device_keys where key_hash = encode(digest(dkey, 'sha256'), 'hex');
  if d.id is null then raise exception 'unknown device'; end if;
  if w->>'ext_id' is null or mins is null or mins <= 0 or mins > 1440 or km < 0 or km > 1000 then raise exception 'bad workout'; end if;
  select id into wid from workouts where user_id = d.user_id and ext_id = w->>'ext_id';
  if wid is not null then return wid; end if;
  insert into workouts (user_id, type, title, started_at, duration_min, distance_km, kcal, avg_hr, visibility, ext_id)
  values (d.user_id, left(coalesce(w->>'type', 'etc'), 20), left(w->>'title', 60), (w->>'started_at')::timestamptz, mins, km,
    least(greatest(coalesce((w->>'kcal')::numeric, 0), 0), 20000),
    -- 심박은 건강정보 동의한 사람만
    case when exists (select 1 from consents c where c.user_id = d.user_id and c.kind = 'health')
      and (w->>'avg_hr')::int between 30 and 230 then (w->>'avg_hr')::int end,
    d.visibility, w->>'ext_id')
  returning id into wid;
  if route is not null and char_length(route) <= 40000
     and exists (select 1 from consents c where c.user_id = d.user_id and c.kind = 'location') then
    insert into workout_routes (workout_id, user_id, poly) values (wid, d.user_id, route) on conflict do nothing;
  end if;
  update device_keys set last_used = now() where id = d.id;
  return wid;
end $$;
revoke all on function auto_upload(text, jsonb, text) from public;
grant execute on function auto_upload(text, jsonb, text) to anon, authenticated;

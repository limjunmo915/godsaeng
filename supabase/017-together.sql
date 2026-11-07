-- 017: 함께한 운동(스트라바 '그룹 활동' 벤치마킹, 11-07). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 누구끼리: 같은 크루 또는 친구(서로 팔로우), 차단 사이 제외, 둘 다 '크루·친구 공개' 기록일 때만
-- 1) 자동으로 찾기(기록·경로가 올라오는 순간 서버가 확인). 운동 시간이 절반 이상 겹치고
--    · 둘 다 경로가 있으면: 짧은 쪽 경로의 80% 이상이 상대 경로 50m 안 → 바로 '함께'
--    · 경로가 없으면(테니스·실내 등): 같은 종목 + 시간 80% 이상 겹침 + 같은 활동 지역 → '함께했나요?' 확인 대기(둘 중 누가 눌러도 됨)
-- 2) 직접 추가: 내 기록에 크루원·친구를 골라 요청 → 상대가 수락하면 상대의 겹치는 같은 종목 기록과 연결, 없으면 내 기록을 복사해 줌
-- 3) 둘 중 누구든 언제든 빼기. 설정에서 '함께한 운동 자동으로 찾기' 끄기(profiles.together_off)
-- 경로가 겹쳐 '함께'가 되면 서로의 위치를 알게 되므로 위치정보 '제공' 사실을 양쪽 다 기록(015 location_logs)

create extension if not exists postgis with schema extensions;

alter table profiles add column if not exists together_off boolean not null default false;

create table if not exists together (
  id bigint generated always as identity primary key,
  w1 uuid not null references workouts on delete cascade,   -- 먼저 올린(또는 요청한) 기록
  u2 uuid not null references profiles on delete cascade,   -- 상대
  w2 uuid references workouts on delete cascade,            -- 상대 기록(직접 요청은 수락 전까지 비어 있음)
  status text not null check (status in ('ok', 'ask')),      -- ok = 함께, ask = 확인 대기
  asked_by uuid references profiles on delete cascade,       -- 직접 요청한 사람(자동으로 찾은 건 비어 있음)
  created_at timestamptz not null default now(),
  unique (w1, u2)
);
create index if not exists together_w2 on together (w2);
create index if not exists together_u2 on together (u2);
alter table together enable row level security;   -- 정책 없음 = 표를 직접 읽고 쓸 수 없음. 아래 함수로만

-- 두 사람이 크루원 또는 친구인가(로그인 없이 올라오는 워치 기록에서도 쓰도록 auth.uid() 를 안 씀)
create or replace function linked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and not is_blocked(a, b) and (
    exists (select 1 from crew_members x join crew_members y on x.crew_id = y.crew_id where x.user_id = a and y.user_id = b)
    or (exists (select 1 from follows where follower = a and followee = b) and exists (select 1 from follows where follower = b and followee = a)))
$$;

-- 두 경로가 얼마나 겹치나(0~1): 짧은 쪽 경로 중 상대 경로 50m 안에 있는 비율
create or replace function route_overlap(p1 text, p2 text) returns numeric
language plpgsql immutable set search_path = public, extensions as $$
declare a geography; b geography;
begin
  a := st_linefromencodedpolyline(p1, 5)::geography; b := st_linefromencodedpolyline(p2, 5)::geography;
  return greatest(
    coalesce(st_length(st_intersection(a, st_buffer(b, 50))) / nullif(st_length(a), 0), 0),
    coalesce(st_length(st_intersection(b, st_buffer(a, 50))) / nullif(st_length(b), 0), 0));
exception when others then return 0;   -- 점이 하나뿐인 경로 등
end $$;

-- 이 기록과 함께한 기록 찾기
-- ponytail: 시간이 겹치는 남의 기록을 다 훑음. 사용자가 수만 명이 되면 시간 인덱스(started_at)만 쓰는 조건으로 좁히기
create or replace function detect_together(wid uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare w workouts; o record; s text; p1 text; reg text; t_end timestamptz;
begin
  select * into w from workouts where id = wid;
  if w.id is null or w.visibility <> 'crew' or (select together_off from profiles where id = w.user_id) then return; end if;
  t_end := w.started_at + interval '1 minute' * w.duration_min::float8;
  select poly into p1 from workout_routes where workout_id = wid;
  select region into reg from profiles where id = w.user_id;
  for o in
    select x.id, x.user_id, x.type, r.poly, p.region,
      extract(epoch from least(t_end, x.started_at + interval '1 minute' * x.duration_min::float8) - greatest(w.started_at, x.started_at))
        / 60 / least(w.duration_min, x.duration_min) as share
    from workouts x join profiles p on p.id = x.user_id left join workout_routes r on r.workout_id = x.id
    where x.user_id <> w.user_id and x.visibility = 'crew' and not p.together_off
      and x.started_at < t_end and x.started_at + interval '1 minute' * x.duration_min::float8 > w.started_at
      and linked(w.user_id, x.user_id)
  loop
    continue when o.share < 0.5;
    s := case
      when p1 is not null and o.poly is not null then case when route_overlap(p1, o.poly) >= 0.8 then 'ok' end
      when o.type = w.type and o.share >= 0.8 and reg is not null and reg = o.region then 'ask' end;
    if s is null then
      -- 경로가 둘 다 있는데 안 겹치면, 경로 올라오기 전에 만든 '함께했나요?'는 지움
      if p1 is not null and o.poly is not null then
        delete from together where asked_by is null and status = 'ask' and ((w1 = wid and w2 = o.id) or (w1 = o.id and w2 = wid));
      end if;
      continue;
    end if;
    update together set status = case when s = 'ok' then 'ok' else status end, w2 = coalesce(w2, wid)
      where w1 = o.id and u2 = w.user_id and (w2 is null or w2 = wid);
    if not found then
      insert into together (w1, u2, w2, status) values (wid, o.user_id, o.id, s)
      on conflict (w1, u2) do update set status = case when excluded.status = 'ok' then 'ok' else together.status end, w2 = coalesce(together.w2, excluded.w2)
        where together.w2 is null or together.w2 = excluded.w2;
    end if;
    if s = 'ok' then
      insert into location_logs (subject_id, actor_id, workout_id, action) values (o.user_id, w.user_id, o.id, 'provide'), (w.user_id, o.user_id, wid, 'provide');
    end if;
  end loop;
end $$;
revoke all on function detect_together(uuid) from public, anon, authenticated;

-- 기록·경로가 올라오면 자동 확인. 확인이 실패해도 기록 올리기는 막지 않음
create or replace function together_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform detect_together(coalesce(to_jsonb(new)->>'workout_id', to_jsonb(new)->>'id')::uuid);
  return null;
exception when others then return null;
end $$;
drop trigger if exists together_w on workouts;
create trigger together_w after insert on workouts for each row execute function together_trg();
drop trigger if exists together_r on workout_routes;
create trigger together_r after insert on workout_routes for each row execute function together_trg();

-- 피드: 이 기록들과 함께한 사람. 이름은 내가 아는 사람(크루원·친구)만, 확인 대기는 당사자에게만
create or replace function together_of(ids uuid[])
returns table (id bigint, workout_id uuid, partner uuid, name text, status text, asked_by uuid)
language sql stable security definer set search_path = public as $$
  with pairs as (
    select t.id, t.w1 as wid, t.u2 as partner, t.status, t.asked_by from together t where t.w1 = any(ids)
    union all
    select t.id, t.w2, w.user_id, t.status, t.asked_by from together t join workouts w on w.id = t.w1 where t.w2 = any(ids)
  )
  select p.id, p.wid, p.partner, case when shares_crew(p.partner) then pr.nickname end, p.status, p.asked_by
  from pairs p join workouts mw on mw.id = p.wid join profiles pr on pr.id = p.partner
  where can_see_workout(p.wid) and not is_blocked(auth.uid(), p.partner)
    and (p.status = 'ok' or auth.uid() in (mw.user_id, p.partner))
$$;
revoke all on function together_of(uuid[]) from public, anon;
grant execute on function together_of(uuid[]) to authenticated;

-- 알림: 나에게 온 '함께했나요?'(내가 보낸 요청은 빼고)
create or replace function together_asks()
returns table (id bigint, other uuid, wid uuid, type text, title text, started_at timestamptz, created_at timestamptz, manual boolean)
language sql stable security definer set search_path = public as $$
  select t.id, case when t.u2 = auth.uid() then w.user_id else t.u2 end, t.w1, w.type, w.title, w.started_at, t.created_at, t.asked_by is not null
  from together t join workouts w on w.id = t.w1
  where t.status = 'ask' and t.asked_by is distinct from auth.uid()
    and (t.u2 = auth.uid() or (t.asked_by is null and w.user_id = auth.uid()))
    and not is_blocked(w.user_id, t.u2)
$$;
revoke all on function together_asks() from public, anon;
grant execute on function together_asks() to authenticated;

-- 직접 추가: 내 기록에 크루원·친구를 함께한 사람으로 요청
create or replace function ask_together(wid uuid, who uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workouts where id = wid and user_id = auth.uid() and visibility = 'crew') then raise exception 'not your workout'; end if;
  if not linked(auth.uid(), who) then raise exception 'not linked'; end if;
  if (select count(*) from together where w1 = wid) >= 20 then raise exception 'too many'; end if;
  if exists (select 1 from together t join workouts x on x.id = t.w1 where t.w2 = wid and x.user_id = who) then return; end if;   -- 이미 연결됨
  insert into together (w1, u2, status, asked_by) values (wid, who, 'ask', auth.uid()) on conflict do nothing;
end $$;
revoke all on function ask_together(uuid, uuid) from public, anon;
grant execute on function ask_together(uuid, uuid) to authenticated;

-- 수락: 자동으로 찾은 건 바로 '함께'. 직접 요청은 내 기록 중 겹치는 같은 종목과 연결, 없으면 상대 기록을 내 기록으로 복사
create or replace function answer_together(tid bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare t together; w workouts; mine uuid;
begin
  select * into t from together where id = tid and status = 'ask' and asked_by is distinct from auth.uid();
  if t.id is null then raise exception 'not found'; end if;
  select * into w from workouts where id = t.w1;
  if auth.uid() not in (w.user_id, t.u2) then raise exception 'not yours'; end if;
  if t.w2 is null then
    select x.id into mine from workouts x where x.user_id = auth.uid() and x.type = w.type
      and x.started_at < w.started_at + interval '1 minute' * w.duration_min::float8
      and x.started_at + interval '1 minute' * x.duration_min::float8 > w.started_at
      order by abs(extract(epoch from x.started_at - w.started_at)) limit 1;
    if mine is null then
      insert into workouts (user_id, type, title, started_at, duration_min, distance_km, elev_m, visibility)
      values (auth.uid(), w.type, w.title, w.started_at, w.duration_min, w.distance_km, w.elev_m, 'crew') returning id into mine;
    end if;
    -- 복사본이 올라가며 자동 확인이 이 줄을 먼저 채웠을 수 있음
    update together set w2 = coalesce(w2, mine), status = 'ok' where id = tid;
  else
    update together set status = 'ok' where id = tid;
  end if;
  return coalesce(t.w2, mine);
end $$;
revoke all on function answer_together(bigint) from public, anon;
grant execute on function answer_together(bigint) to authenticated;

-- 거절·빼기: 둘 중 누구든
create or replace function drop_together(tid bigint) returns void
language sql security definer set search_path = public as $$
  delete from together t using workouts w
  where t.id = tid and w.id = t.w1 and auth.uid() in (w.user_id, t.u2)
$$;
revoke all on function drop_together(bigint) from public, anon;
grant execute on function drop_together(bigint) to authenticated;

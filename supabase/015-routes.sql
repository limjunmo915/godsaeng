-- 015: 운동 경로 저장(위치정보법 대비, 11-05). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 1) 위치정보 동의(consents.kind = 'location'): 동의한 사람만 경로를 저장. 철회하면 경로 전부 삭제
-- 2) 경로는 출발·도착 200m 를 잘라낸 뒤 앱이 줄여서(encoded polyline) 저장. 기록·계정을 지우면 같이 지워짐
-- 3) 보는 사람: 기록을 볼 수 있는 크루·친구(차단한 사이 제외). 남의 경로를 읽을 때마다 '제공 사실'을 자동 기록
-- 4) 위치정보 수집·이용·제공사실 확인자료(location_logs): 위치정보법 제16조 → 자동 기록, 1년 보관 후 삭제(법정 최소 6개월)

-- 동의 종류에 'location' 추가
alter table consents drop constraint if exists consents_kind_check;
alter table consents add constraint consents_kind_check check (kind in ('terms', 'health', 'location'));
drop policy if exists cs_health on consents;
create policy cs_health on consents for all to authenticated
  using (user_id = auth.uid() and kind in ('health', 'location')) with check (user_id = auth.uid() and kind in ('health', 'location'));

create table if not exists workout_routes (
  workout_id uuid primary key references workouts on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  poly text not null check (char_length(poly) <= 40000),   -- encoded polyline(점 최대 약 1,000개)
  created_at timestamptz not null default now()
);
alter table workout_routes enable row level security;
drop policy if exists wr_own on workout_routes;
-- 표를 직접 다루는 건 본인 경로만, 본인 기록에만, 위치 동의한 경우만. 남의 경로는 아래 routes_of() 로만(제공 기록 남김)
create policy wr_own on workout_routes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid())
    and exists (select 1 from consents c where c.user_id = auth.uid() and c.kind = 'location'));

create table if not exists location_logs (
  id bigint generated always as identity primary key,
  subject_id uuid not null,              -- 위치정보 주체(경로 주인)
  actor_id uuid,                         -- 제공받은 사람(수집이면 본인)
  workout_id uuid,
  action text not null check (action in ('collect', 'provide', 'delete')),
  at timestamptz not null default now()
);
create index if not exists location_logs_subject on location_logs (subject_id, at desc);
alter table location_logs enable row level security;
drop policy if exists ll_sel on location_logs;
-- 본인에 대한 기록은 본인이 볼 수 있음(열람 요구 대응). 쓰기는 서버 함수로만
create policy ll_sel on location_logs for select to authenticated using (subject_id = auth.uid());

-- 경로 저장·삭제 시 자동 기록 + 1년 지난 기록 정리
create or replace function route_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into location_logs (subject_id, actor_id, workout_id, action) values (old.user_id, auth.uid(), old.workout_id, 'delete');
    return old;
  end if;
  insert into location_logs (subject_id, actor_id, workout_id, action) values (new.user_id, new.user_id, new.workout_id, 'collect');
  delete from location_logs where at < now() - interval '1 year';
  return new;
end $$;
drop trigger if exists route_log on workout_routes;
create trigger route_log after insert or delete on workout_routes for each row execute function route_log();

-- 경로 읽기(피드): 볼 수 있는 기록의 경로만 돌려주고, 남의 경로면 '제공' 기록
create or replace function routes_of(ids uuid[]) returns table (workout_id uuid, poly text)
language plpgsql security definer set search_path = public as $$
begin
  insert into location_logs (subject_id, actor_id, workout_id, action)
    select r.user_id, auth.uid(), r.workout_id, 'provide' from workout_routes r
    where r.workout_id = any(ids) and r.user_id <> auth.uid() and can_interact(r.workout_id);
  return query select r.workout_id, r.poly from workout_routes r
    where r.workout_id = any(ids) and (r.user_id = auth.uid() or can_interact(r.workout_id));
end $$;
revoke all on function routes_of(uuid[]) from public, anon;
grant execute on function routes_of(uuid[]) to authenticated;

-- 위치 동의 철회: 동의 기록과 내 경로 전부 삭제
create or replace function withdraw_location() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from workout_routes where user_id = auth.uid();
  delete from consents where user_id = auth.uid() and kind = 'location';
end $$;
revoke all on function withdraw_location() from public, anon;
grant execute on function withdraw_location() to authenticated;

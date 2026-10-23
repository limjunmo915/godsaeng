-- 갓생살기 — 007: 특정 사람 차단 + 약올리기 받기 끄기
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 001 을 다시 실행했다면 002 → 004 → 005 → 006 → 007 순서로 다시 실행. 003 을 다시 실행했다면 007 도 다시(약올리기 검사 덮어씀)
-- 차단하면 서로(양방향) 약올리기·댓글·반응을 못 함. 화면에서 상대 기록·댓글·약올리기를 숨기는 건 앱이 함(내 차단 목록 기준)
-- 랭킹 집계에는 그대로 포함(크루 순위가 왜곡되지 않게)

alter table profiles add column if not exists poke_off boolean not null default false;  -- true = 약올리기 안 받기

create table if not exists blocks (
  blocker uuid not null default auth.uid() references profiles on delete cascade,
  blocked uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table blocks enable row level security;
-- 내 차단 목록만 보고 관리(누가 나를 차단했는지는 볼 수 없음)
drop policy if exists b_all on blocks;
create policy b_all on blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- 둘 중 한 명이라도 차단했나
create or replace function is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

-- 이 기록에 반응·댓글을 달 수 있나: 볼 수 있고, 기록 주인과 차단 관계가 아님
create or replace function can_interact(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_see_workout(wid) and not exists (select 1 from workouts w where w.id = wid and is_blocked(auth.uid(), w.user_id))
$$;

drop policy if exists r_ins on reactions;
create policy r_ins on reactions for insert to authenticated with check (user_id = auth.uid() and can_interact(workout_id));
drop policy if exists r_upd on reactions;
create policy r_upd on reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and can_interact(workout_id));
drop policy if exists cm_ins on comments;
create policy cm_ins on comments for insert to authenticated with check (user_id = auth.uid() and can_interact(workout_id));

-- 약올리기 검사(003 내용 + 받기 끔 + 차단)
create or replace function pokes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.to_id and poke_off) then
    raise exception '이 사람은 약올리기 받기를 꺼 뒀어요';
  end if;
  if is_blocked(new.from_id, new.to_id) then
    raise exception '지금은 이 사람을 약올릴 수 없어요';
  end if;
  if exists (select 1 from pokes where from_id = new.from_id and to_id = new.to_id and created_at > now() - interval '1 minute') then
    raise exception '약올리기는 같은 사람에게 1분에 한 번만 할 수 있어요';
  end if;
  delete from pokes where created_at < now() - interval '14 days';
  return new;
end $$;

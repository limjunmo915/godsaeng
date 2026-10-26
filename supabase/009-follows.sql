-- 갓생살기 — 009: 팔로우·친구(맞팔로우)·닉네임 검색·친구 초대 링크
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 001 을 다시 실행했다면 002 → 004 → 005 → 006 → 007 → 008 → 009 순서로 다시(shares_crew·약올리기 정책 덮어씀)
-- 규칙: 팔로우만 해서는 아무것도 안 보임. 서로 팔로우(친구)해야 기록·사진이 보이고 반응·댓글·약올리기 가능
--       약올리기 = 지금 같은 크루이거나 친구일 때만(크루를 나가고 친구가 아니면 불가)

alter table profiles add column if not exists searchable boolean not null default true;  -- 닉네임 검색에 나 표시

create table if not exists follows (
  follower uuid not null default auth.uid() references profiles on delete cascade,
  followee uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on follows (followee);
alter table follows enable row level security;
drop policy if exists f_sel on follows;
drop policy if exists f_ins on follows;
drop policy if exists f_del on follows;
-- 나와 관련된 팔로우만 보임. 팔로우는 내가, 끊기는 양쪽 다(언팔로우 / 팔로워 삭제)
create policy f_sel on follows for select to authenticated using (follower = auth.uid() or followee = auth.uid());
create policy f_ins on follows for insert to authenticated with check (follower = auth.uid() and not is_blocked(auth.uid(), followee));
create policy f_del on follows for delete to authenticated using (follower = auth.uid() or followee = auth.uid());

-- 친구 = 서로 팔로우
create or replace function is_friend(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows a join follows b on b.follower = a.followee and b.followee = a.follower
                 where a.follower = auth.uid() and a.followee = other)
$$;

-- '같은 크루이거나 친구'로 넓힘 → 프로필·장비·기록(crew_workouts)·반응·댓글(can_see_workout)·사진 열람에 친구 포함
create or replace function shares_crew(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
    where a.user_id = auth.uid() and b.user_id = other) or is_friend(other)
$$;

-- 팔로우 관계인 사람은 닉네임 정도는 보여야 함(받은 팔로우 목록). 기록은 친구가 될 때까지 안 보임
drop policy if exists p_follow on profiles;
create policy p_follow on profiles for select to authenticated using (
  exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = profiles.id) or (f.followee = auth.uid() and f.follower = profiles.id)));

-- 닉네임 검색(2자 이상, 20명까지). 검색을 끈 사람·차단 관계·나는 제외. 닉네임·사진 경로만 돌려줌
create or replace function search_users(q text) returns table (id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url from profiles p
  where char_length(trim(q)) >= 2 and p.searchable and p.id <> auth.uid() and not is_blocked(auth.uid(), p.id)
    and p.nickname ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.nickname limit 20
$$;
revoke execute on function search_users(text) from public, anon;
grant execute on function search_users(text) to authenticated;

-- 친구 초대 링크: 사람마다 무작위 코드(아이디 노출 안 함). 링크로 들어오면 바로 서로 팔로우(친구)
create table if not exists friend_codes (
  user_id uuid primary key references profiles on delete cascade,
  code text not null unique default substr(md5(gen_random_uuid()::text), 1, 10)
);
alter table friend_codes enable row level security;
drop policy if exists fc_sel on friend_codes;
create policy fc_sel on friend_codes for select to authenticated using (user_id = auth.uid());

create or replace function my_friend_code() returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into friend_codes (user_id) values (auth.uid()) on conflict do nothing;
  return (select code from friend_codes where user_id = auth.uid());
end $$;

create or replace function add_friend_by_code(c text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select user_id into other from friend_codes where code = trim(c);
  if other is null then raise exception '초대 링크가 맞지 않아요'; end if;
  if other = auth.uid() then raise exception '내 초대 링크예요. 친구에게 보내 주세요'; end if;
  if is_blocked(auth.uid(), other) then raise exception '지금은 이 사람과 친구를 맺을 수 없어요'; end if;
  insert into follows (follower, followee) values (auth.uid(), other), (other, auth.uid()) on conflict do nothing;
  return other;
end $$;
revoke execute on function my_friend_code(), add_friend_by_code(text) from public, anon;
grant execute on function my_friend_code(), add_friend_by_code(text) to authenticated;

-- 차단하면 서로의 팔로우도 끊김
create or replace function blocks_unfollow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from follows where (follower = new.blocker and followee = new.blocked) or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
drop trigger if exists blocks_unfollow on blocks;
create trigger blocks_unfollow after insert on blocks for each row execute function blocks_unfollow();

-- 약올리기: 크루 약올리기(crew_id 있음) 또는 친구 약올리기(crew_id 없음)
alter table pokes alter column crew_id drop not null;
drop policy if exists k_sel on pokes;
drop policy if exists k_ins on pokes;
create policy k_sel on pokes for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid() or (crew_id is not null and is_member(crew_id)));
create policy k_ins on pokes for insert to authenticated with check (from_id = auth.uid() and (
  (crew_id is not null and is_member(crew_id) and exists (select 1 from crew_members m where m.crew_id = pokes.crew_id and m.user_id = to_id))
  or (crew_id is null and is_friend(to_id))));

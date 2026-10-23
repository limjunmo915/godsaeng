-- 갓생살기 프로젝트 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 if not exists / or replace 사용.

-- ───────── 테이블 ─────────
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default '갓생러' check (char_length(nickname) between 1 and 20),
  avatar_url text,
  weekly_goal_min int not null default 150 check (weekly_goal_min between 0 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists crew_members (
  crew_id uuid references crews on delete cascade,
  user_id uuid references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create table if not exists gear (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'shoes' check (kind in ('shoes','bike','etc')),
  retire_km numeric check (retire_km > 0),
  retired boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  type text not null,
  title text check (char_length(title) <= 60),
  started_at timestamptz not null default now(),
  duration_min numeric not null check (duration_min > 0 and duration_min <= 1440),
  distance_km numeric not null default 0 check (distance_km between 0 and 1000),
  elev_m numeric not null default 0 check (elev_m between 0 and 20000),
  kcal numeric not null default 0 check (kcal between 0 and 20000),
  avg_hr int check (avg_hr between 30 and 230),
  rpe int check (rpe between 1 and 10),
  brag text check (char_length(brag) <= 80),
  memo text check (char_length(memo) <= 1000),
  photos text[] not null default '{}' check (cardinality(photos) <= 10),
  gear_id uuid references gear on delete set null,
  tags text[] not null default '{}',
  hide_stats text[] not null default '{}',
  visibility text not null default 'crew' check (visibility in ('crew','private')),
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_started on workouts (user_id, started_at desc);

-- 비공개 메모: 행 단위로 본인만 볼 수 있게 별도 테이블
create table if not exists private_notes (
  workout_id uuid primary key references workouts on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  note text not null check (char_length(note) <= 1000)
);

create table if not exists reactions (
  workout_id uuid references workouts on delete cascade,
  user_id uuid default auth.uid() references profiles on delete cascade,
  kind text not null check (kind in ('fire','mad','meh','sofa')),
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists comments_workout on comments (workout_id, created_at);

create table if not exists pokes (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references profiles on delete cascade,
  to_id uuid not null references profiles on delete cascade,
  crew_id uuid not null references crews on delete cascade,
  text text not null check (char_length(text) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists pokes_crew on pokes (crew_id, created_at desc);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews on delete cascade,
  created_by uuid not null default auth.uid() references profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  metric text not null check (metric in ('minutes','distance','kcal','count')),
  target numeric not null check (target > 0),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  bet text check (char_length(bet) <= 60),
  created_at timestamptz not null default now()
);

-- ───────── 권한 판단 함수 (RLS 재귀 방지용 security definer) ─────────
create or replace function is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_members where crew_id = c and user_id = auth.uid())
$$;

create or replace function shares_crew(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
    where a.user_id = auth.uid() and b.user_id = other)
$$;

-- 크루 만들기 / 초대코드로 가입 (crew_members 에는 이 함수로만 들어감)
create or replace function create_crew(crew_name text) returns crews
language plpgsql security definer set search_path = public as $$
declare c crews;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into crews (name, created_by) values (crew_name, auth.uid()) returning * into c;
  insert into crew_members (crew_id, user_id) values (c.id, auth.uid());
  return c;
end $$;

create or replace function join_crew(code text) returns crews
language plpgsql security definer set search_path = public as $$
declare c crews;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into c from crews where invite_code = upper(trim(code));
  if c.id is null then raise exception '초대코드가 맞지 않아요'; end if;
  insert into crew_members (crew_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return c;
end $$;

-- 가입하면 프로필 자동 생성 (구글이면 이름·사진, 이메일이면 메일 앞부분)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname, avatar_url) values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '갓생러'), 20),
    new.raw_user_meta_data->>'avatar_url')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────── 행 단위 보안(RLS) ─────────
alter table profiles enable row level security;
alter table crews enable row level security;
alter table crew_members enable row level security;
alter table gear enable row level security;
alter table workouts enable row level security;
alter table private_notes enable row level security;
alter table reactions enable row level security;
alter table comments enable row level security;
alter table pokes enable row level security;
alter table challenges enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- 프로필: 나 + 같은 크루 사람만 보임, 본인만 수정
create policy p_sel on profiles for select to authenticated using (shares_crew(id));
create policy p_ins on profiles for insert to authenticated with check (id = auth.uid());
create policy p_upd on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 크루: 멤버만 보임, 만든 사람만 이름 수정/삭제 (생성·가입은 함수로)
create policy c_sel on crews for select to authenticated using (is_member(id));
create policy c_upd on crews for update to authenticated using (created_by = auth.uid());
create policy c_del on crews for delete to authenticated using (created_by = auth.uid());

-- 크루 멤버: 같은 크루면 보임, 본인만 탈퇴
create policy m_sel on crew_members for select to authenticated using (is_member(crew_id));
create policy m_del on crew_members for delete to authenticated using (user_id = auth.uid());

-- 장비: 본인 것만 관리, 같은 크루는 이름만 볼 수 있게 읽기 허용
create policy g_sel on gear for select to authenticated using (shares_crew(user_id));
create policy g_all on gear for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 운동 기록: 내 것 + 같은 크루의 '크루 공개' 기록만 보임, 수정/삭제는 본인만
create policy w_sel on workouts for select to authenticated
  using (user_id = auth.uid() or (visibility = 'crew' and shares_crew(user_id)));
create policy w_ins on workouts for insert to authenticated with check (user_id = auth.uid());
create policy w_upd on workouts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy w_del on workouts for delete to authenticated using (user_id = auth.uid());

-- 비공개 메모: 본인만
create policy n_all on private_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 반응·댓글: 볼 수 있는 기록에만, 본인 것만 쓰기/지우기
create policy r_sel on reactions for select to authenticated using (exists (select 1 from workouts w where w.id = workout_id));
create policy r_ins on reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from workouts w where w.id = workout_id));
create policy r_upd on reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy r_del on reactions for delete to authenticated using (user_id = auth.uid());

create policy cm_sel on comments for select to authenticated using (exists (select 1 from workouts w where w.id = workout_id));
create policy cm_ins on comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from workouts w where w.id = workout_id));
create policy cm_del on comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));

-- 약올리기: 같은 크루 안에서만
create policy k_sel on pokes for select to authenticated using (is_member(crew_id));
create policy k_ins on pokes for insert to authenticated
  with check (from_id = auth.uid() and is_member(crew_id) and exists (select 1 from crew_members m where m.crew_id = pokes.crew_id and m.user_id = to_id));
create policy k_del on pokes for delete to authenticated using (from_id = auth.uid());

-- 챌린지: 크루 멤버가 만들고 봄, 만든 사람만 삭제
create policy ch_sel on challenges for select to authenticated using (is_member(crew_id));
create policy ch_ins on challenges for insert to authenticated with check (created_by = auth.uid() and is_member(crew_id));
create policy ch_del on challenges for delete to authenticated using (created_by = auth.uid());

-- ───────── 사진 저장소 (비공개 버킷: 같은 크루만 열람) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists ph_sel on storage.objects;
drop policy if exists ph_ins on storage.objects;
drop policy if exists ph_del on storage.objects;
-- 경로 규칙: <내 user id>/<파일명>
create policy ph_sel on storage.objects for select to authenticated
  using (bucket_id = 'photos' and shares_crew(((storage.foldername(name))[1])::uuid));
create policy ph_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy ph_del on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

grant execute on function create_crew(text), join_crew(text) to authenticated;

-- 신체 기록(본인 전용)은 002-body.sql 에 있음. 새로 설치할 때도 이어서 실행.

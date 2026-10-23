-- 갓생살기 — 002: 신체 기록 (본인만 볼 수 있음)
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.

-- 기본 정보 (1인 1행)
create table if not exists body_profile (
  user_id uuid primary key default auth.uid() references profiles on delete cascade,
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('male','female')),
  height_cm numeric check (height_cm between 80 and 250),
  updated_at timestamptz not null default now()
);

-- 측정 기록 (하루 1행)
create table if not exists body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric check (weight_kg between 20 and 300),
  body_fat_pct numeric check (body_fat_pct between 2 and 70),
  muscle_kg numeric check (muscle_kg between 5 and 150),
  waist_cm numeric check (waist_cm between 30 and 200),
  resting_hr int check (resting_hr between 30 and 120),
  memo text check (char_length(memo) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

alter table body_profile enable row level security;
alter table body_logs enable row level security;

-- 본인만 읽기·쓰기. 크루원·다른 사용자에게는 존재 자체가 보이지 않음
drop policy if exists bp_own on body_profile;
drop policy if exists bl_own on body_logs;
create policy bp_own on body_profile for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bl_own on body_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 예전 체중 칸은 크루원도 조회 가능했으므로 삭제 (값은 신체 기록으로 옮김)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'weight_kg') then
    insert into body_logs (user_id, measured_on, weight_kg)
      select id, current_date, weight_kg from profiles where weight_kg <> 70
      on conflict (user_id, measured_on) do nothing;
    alter table profiles drop column weight_kg;
  end if;
end $$;

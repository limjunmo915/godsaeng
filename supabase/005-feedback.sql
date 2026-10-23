-- 갓생살기 — 005: 건의·버그 제보·신고 보내기
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 사용자는 보내기만 가능(읽기 정책 없음). 운영자는 대시보드 Table Editor > feedback 에서 확인

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  kind text not null check (kind in ('idea','bug','report','etc')),
  body text not null check (char_length(body) between 1 and 1000),
  workout_id uuid references workouts on delete set null,   -- 신고한 기록
  comment_id uuid references comments on delete set null,   -- 신고한 댓글
  target_user uuid references profiles on delete set null,  -- 신고당한 사람
  snapshot text check (char_length(snapshot) <= 1000),      -- 신고 당시 내용(작성자가 지워도 남게)
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_new on feedback (status, created_at desc);

alter table feedback enable row level security;
drop policy if exists f_ins on feedback;
create policy f_ins on feedback for insert to authenticated with check (user_id = auth.uid() and status = 'new');

-- 도배 방지: 10분에 5건까지
create or replace function feedback_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from feedback where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception '잠시 후 다시 보내 주세요 (10분에 5건까지)';
  end if;
  return new;
end $$;
drop trigger if exists feedback_guard on feedback;
create trigger feedback_guard before insert on feedback for each row execute function feedback_guard();

-- 018: 댓글 하트(11-09). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 볼 수 있는 기록의 댓글에만, 한 사람당 댓글 하나에 하트 하나. 차단한 사이는 못 누름. 댓글·계정이 지워지면 같이 지워짐
create table if not exists comment_likes (
  comment_id uuid references comments on delete cascade,
  user_id uuid default auth.uid() references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table comment_likes enable row level security;
drop policy if exists cl_sel on comment_likes;
drop policy if exists cl_ins on comment_likes;
drop policy if exists cl_del on comment_likes;
create policy cl_sel on comment_likes for select to authenticated
  using (exists (select 1 from comments c where c.id = comment_id and can_see_workout(c.workout_id)));
create policy cl_ins on comment_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from comments c where c.id = comment_id
    and can_interact(c.workout_id) and not is_blocked(auth.uid(), c.user_id)));
create policy cl_del on comment_likes for delete to authenticated using (user_id = auth.uid());

-- 앱이 새 표를 바로 알아보도록 목록 새로고침
notify pgrst, 'reload schema';

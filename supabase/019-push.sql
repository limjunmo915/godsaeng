-- 019: 휴대폰 푸시 알림(11-12). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 흐름: 반응·댓글·댓글 하트·약올리기·팔로우·메시지·함께한 운동이 생기면 → push_queue 에 한 줄 → 서버 함수(push)를 깨움
--       → 함수가 대기열을 비우며 받는 사람의 기기(push_tokens)로 FCM 알림을 보냄. 함수 코드는 supabase/functions/push/index.ts
-- 알림이 실패해도 원래 동작(반응·댓글 등)은 막지 않음. 차단한 사이·자기 자신에게는 안 보냄
-- 반응은 같은 글이면 알림 하나로 합쳐짐("민수님, 지은님 외 2명이 반응했어요")

create extension if not exists pg_net;

-- 기기 토큰: 한 기기에 한 줄. 같은 폰에서 다른 계정으로 로그인하면 주인이 바뀜
create table if not exists push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  user_id uuid not null references profiles on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on push_tokens (user_id);
alter table push_tokens enable row level security;
drop policy if exists pt_own on push_tokens;
create policy pt_own on push_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists pt_del on push_tokens;
create policy pt_del on push_tokens for delete to authenticated using (user_id = auth.uid());

create or replace function save_push_token(tok text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into push_tokens (token, user_id) values (tok, auth.uid())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end $$;
revoke all on function save_push_token(text) from public, anon;
grant execute on function save_push_token(text) to authenticated;

-- 보낼 알림 대기열. 정책 없음 = 앱에서 직접 못 읽고 못 씀(서버 함수만)
create table if not exists push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,   -- 받는 사람
  body text not null,
  tag text,                 -- 같은 tag 는 알림창에서 하나로 바뀜
  data jsonb not null default '{}',   -- 누르면 갈 곳: { w } 기록(워치 자동 올리기 알림의 wid 와 다른 이름), { uid } 프로필, { chat } 대화방
  created_at timestamptz not null default now()
);
alter table push_queue enable row level security;

-- 대기열에 넣기: 기기가 등록된 사람에게만, 자기 자신·차단한 사이는 빼고
create or replace function push_to(recipient uuid, actor uuid, body text, tag text, data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if recipient is null or recipient = actor or is_blocked(recipient, actor) then return; end if;
  if not exists (select 1 from push_tokens where user_id = recipient) then return; end if;
  insert into push_queue (user_id, body, tag, data) values (recipient, left(body, 200), tag, data);
end $$;
revoke all on function push_to(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- 대기열에 줄이 생기면 서버 함수를 깨움(함수는 받은 내용을 안 믿고 대기열만 비우므로 누가 불러도 해가 없음. 열쇠는 공개용 anon)
create or replace function push_wake() returns trigger
language plpgsql security definer set search_path = public, net, extensions as $$
begin
  perform net.http_post(
    url := 'https://ghrjtbznjnvzwqthiahm.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdocmp0Ynpuam52endxdGhpYWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc1NDAsImV4cCI6MjEwNzQxMzU0MH0.Q2M1w4dzgmfc28voCetOP4UyOjEwF6ZDqOnC5hC5FMc'),
    body := '{}'::jsonb);
  return null;
exception when others then return null;
end $$;
drop trigger if exists push_wake on push_queue;
create trigger push_wake after insert on push_queue for each statement execute function push_wake();

-- 무슨 일이 생겼는지 → 알림 글
create or replace function push_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; owner uuid; n int; names text; t text; r record;
begin
  if tg_table_name = 'reactions' then
    if tg_op = 'UPDATE' and new.kind = old.kind then return null; end if;
    select user_id into owner from workouts where id = new.workout_id;
    select string_agg(nick, ', ' order by me desc, at desc) into names from (
      select p.nickname || '님' as nick, (x.user_id = new.user_id) as me, x.created_at as at
      from reactions x join profiles p on p.id = x.user_id
      where x.workout_id = new.workout_id and x.user_id <> owner and not is_blocked(owner, x.user_id)
      order by 2 desc, 3 desc limit 3) s;   -- 방금 누른 사람 먼저, 최근 순 3명
    select count(*) into n from reactions x where x.workout_id = new.workout_id and x.user_id <> owner and not is_blocked(owner, x.user_id);
    perform push_to(owner, new.user_id, names || case when n > 3 then ' 외 ' || (n - 3) || '명이' else '이' end || ' 내 운동에 반응했어요',
      'rx:' || new.workout_id, jsonb_build_object('w', new.workout_id));
  elsif tg_table_name = 'comments' then
    select nickname into who from profiles where id = new.user_id;
    select user_id into owner from workouts where id = new.workout_id;
    perform push_to(owner, new.user_id, who || '님 댓글: ' || case when new.body like '[kk:%]' then '(스티커)' else new.body end,
      null, jsonb_build_object('w', new.workout_id));
  elsif tg_table_name = 'comment_likes' then
    select nickname into who from profiles where id = new.user_id;
    select c.user_id, c.workout_id::text into owner, t from comments c where c.id = new.comment_id;
    perform push_to(owner, new.user_id, who || '님이 내 댓글에 하트를 눌렀어요', 'cl:' || new.comment_id, jsonb_build_object('w', t));
  elsif tg_table_name = 'pokes' then
    select nickname into who from profiles where id = new.from_id;
    perform push_to(new.to_id, new.from_id, who || '님이 약올림: ' || new.text, 'pk:' || new.from_id, jsonb_build_object('uid', new.from_id));
  elsif tg_table_name = 'follows' then
    select nickname into who from profiles where id = new.follower;
    perform push_to(new.followee, new.follower, who || case when exists (select 1 from follows where follower = new.followee and followee = new.follower)
      then '님과 친구가 됐어요' else '님이 팔로우했어요. 맞팔로우하면 친구가 돼요' end, 'fw:' || new.follower, jsonb_build_object('uid', new.follower));
  elsif tg_table_name = 'messages' then
    select nickname into who from profiles where id = new.from_id;
    if new.to_id is not null then
      perform push_to(new.to_id, new.from_id, who || ': ' || new.body, 'u:' || new.from_id, jsonb_build_object('chat', 'u:' || new.from_id));
    else
      select name into t from crews where id = new.crew_id;
      for r in select user_id from crew_members where crew_id = new.crew_id loop
        perform push_to(r.user_id, new.from_id, t || ' · ' || who || ': ' || new.body, 'c:' || new.crew_id, jsonb_build_object('chat', 'c:' || new.crew_id));
      end loop;
    end if;
  elsif tg_table_name = 'together' then
    select user_id into owner from workouts where id = new.w1;
    if new.asked_by is not null then        -- 직접 요청: 상대에게만
      select nickname into who from profiles where id = owner;
      perform push_to(new.u2, owner, who || '님이 함께 운동했다고 해요. 맞나요?', 'tg:' || new.id, jsonb_build_object('notif', '1'));
    else                                    -- 자동으로 찾음: 둘 다에게
      select nickname into who from profiles where id = owner;
      perform push_to(new.u2, owner, who || case when new.status = 'ok' then '님과 함께한 운동으로 표시됐어요' else '님과 함께 운동했나요?' end,
        'tg:' || new.id, case when new.status = 'ok' and new.w2 is not null then jsonb_build_object('w', new.w2) else jsonb_build_object('notif', '1') end);
      select nickname into who from profiles where id = new.u2;
      perform push_to(owner, new.u2, who || case when new.status = 'ok' then '님과 함께한 운동으로 표시됐어요' else '님과 함께 운동했나요?' end,
        'tg:' || new.id, case when new.status = 'ok' then jsonb_build_object('w', new.w1) else jsonb_build_object('notif', '1') end);
    end if;
  end if;
  return null;
exception when others then return null;   -- 알림 때문에 원래 동작이 막히면 안 됨
end $$;

drop trigger if exists push_rx on reactions;
create trigger push_rx after insert or update on reactions for each row execute function push_event();
drop trigger if exists push_cm on comments;
create trigger push_cm after insert on comments for each row execute function push_event();
drop trigger if exists push_pk on pokes;
create trigger push_pk after insert on pokes for each row execute function push_event();
drop trigger if exists push_fw on follows;
create trigger push_fw after insert on follows for each row execute function push_event();
drop trigger if exists push_msg on messages;
create trigger push_msg after insert on messages for each row execute function push_event();
-- 017·018 을 실행한 경우에만
do $$ begin
  if to_regclass('public.comment_likes') is not null then
    drop trigger if exists push_cl on comment_likes;
    create trigger push_cl after insert on comment_likes for each row execute function push_event();
  end if;
  if to_regclass('public.together') is not null then
    drop trigger if exists push_tg on together;
    create trigger push_tg after insert on together for each row execute function push_event();
  end if;
end $$;

notify pgrst, 'reload schema';

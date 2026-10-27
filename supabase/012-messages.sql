-- 012: 메시지 (10-27)
-- 1:1 = 친구(맞팔)이거나 같은 크루인 사람끼리(약올리기와 같은 규칙), 차단 관계면 못 보냄
-- 크루 단체방 = 그 크루 멤버만. 크루를 나가면 단체방도 못 봄
-- 여러 번 실행해도 안전

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references profiles on delete cascade,
  to_id uuid references profiles on delete cascade,
  crew_id uuid references crews on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((to_id is null) <> (crew_id is null))
);
create index if not exists messages_crew on messages (crew_id, created_at desc);
create index if not exists messages_from on messages (from_id, created_at desc);
create index if not exists messages_to on messages (to_id, created_at desc);
alter table messages enable row level security;

drop policy if exists m_sel on messages;
drop policy if exists m_ins on messages;
drop policy if exists m_del on messages;
create policy m_sel on messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid() or (crew_id is not null and is_member(crew_id)));
create policy m_ins on messages for insert to authenticated with check (from_id = auth.uid() and (
  (crew_id is not null and is_member(crew_id))
  or (to_id is not null and to_id <> auth.uid() and shares_crew(to_id) and not is_blocked(auth.uid(), to_id))));
create policy m_del on messages for delete to authenticated using (from_id = auth.uid());

-- 도배 방지: 1분에 30개까지
create or replace function messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where from_id = new.from_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요';
  end if;
  return new;
end $$;
drop trigger if exists messages_guard on messages;
create trigger messages_guard before insert on messages for each row execute function messages_guard();

-- 실시간 받기(앱이 열려 있으면 새 메시지가 바로 뜸). 볼 수 있는 메시지만 옴(위 정책 그대로 적용)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

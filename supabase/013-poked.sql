-- 013: 약올림 당한 표시 — 24시간 안에 약올림 당한 사람의 글 위에 깐족이를 띄우려고
-- 크루원·친구에게만, 누가 약올렸는지는 알려 주지 않음(가장 최근 약올림의 id·시각만). 여러 번 실행해도 안전
create or replace function recent_poked(ids uuid[])
returns table (user_id uuid, poke_id uuid, at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (p.to_id) p.to_id, p.id, p.created_at
  from pokes p
  where p.to_id = any(ids) and p.to_id <> auth.uid()
    and p.created_at > now() - interval '24 hours'
    and (is_friend(p.to_id) or exists (
      select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
      where a.user_id = auth.uid() and b.user_id = p.to_id))
    and not exists (select 1 from blocks k where (k.blocker = auth.uid() and k.blocked = p.to_id) or (k.blocker = p.to_id and k.blocked = auth.uid()))
  order by p.to_id, p.created_at desc
$$;
revoke all on function recent_poked(uuid[]) from public, anon;
grant execute on function recent_poked(uuid[]) to authenticated;

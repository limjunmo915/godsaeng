-- 갓생살기 — 003: 약올리기 도배 방지(같은 사람에게 1분에 1번) + 2주 지난 약올리기 자동 삭제
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.

create or replace function pokes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pokes where from_id = new.from_id and to_id = new.to_id and created_at > now() - interval '1 minute') then
    raise exception '약올리기는 같은 사람에게 1분에 한 번만 할 수 있어요';
  end if;
  delete from pokes where created_at < now() - interval '14 days';
  return new;
end $$;

drop trigger if exists pokes_guard on pokes;
create trigger pokes_guard before insert on pokes for each row execute function pokes_guard();

-- 이미 쌓인 오래된 약올리기 정리
delete from pokes where created_at < now() - interval '14 days';

-- 갓생살기 — 008: 약관·건강정보 동의 기록 + 만 14세 미만 가입 차단 + 신고 기록 1년 후 삭제
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 001 을 다시 실행했다면 이 파일도 다시(handle_new_user 덮어씀). 005 를 다시 실행했다면 이 파일도 다시(feedback_guard 덮어씀)
-- 주의: 이제 생년월일 없는 가입은 서버가 거절함 → 대시보드 "Add user" 로 사람을 직접 만들 수 없음(앱에서 가입)

-- 동의 기록: terms = 이용약관 + 개인정보처리방침, health = 건강정보(민감정보) 별도 동의
create table if not exists consents (
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  kind text not null check (kind in ('terms','health')),
  version text not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table consents enable row level security;
drop policy if exists cs_sel on consents;
drop policy if exists cs_health on consents;
create policy cs_sel on consents for select to authenticated using (user_id = auth.uid());
-- 건강정보 동의·철회는 본인이 직접. 약관 동의는 아래 agree_terms() 로만(나이 확인)
create policy cs_health on consents for all to authenticated
  using (user_id = auth.uid() and kind = 'health') with check (user_id = auth.uid() and kind = 'health');

-- 가입 직전: 생년월일로 만 14세 이상인지 확인하고, 생년월일은 저장하지 않고 지움
create or replace function check_signup_age() returns trigger
language plpgsql security definer set search_path = public as $$
declare bd date;
begin
  begin bd := (new.raw_user_meta_data->>'birthdate')::date; exception when others then bd := null; end;
  if bd is null or age(current_date, bd) < interval '14 years' then
    raise exception '만 14세 이상만 가입할 수 있어요';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'birthdate';
  return new;
end $$;
drop trigger if exists check_signup_age on auth.users;
create trigger check_signup_age before insert on auth.users for each row execute function check_signup_age();

-- 가입 직후: 프로필 생성(001 과 같음) + 가입 때 동의한 약관 버전 기록
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname, avatar_url) values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '갓생러'), 20),
    null)
  on conflict do nothing;
  if new.raw_user_meta_data ? 'terms_version' then
    insert into consents (user_id, kind, version) values (new.id, 'terms', new.raw_user_meta_data->>'terms_version')
    on conflict (user_id, kind) do nothing;
  end if;
  return new;
end $$;

-- 약관 동의(기존 회원·약관 개정 시). 처음 동의하는 사람은 생년월일로 만 14세 이상 확인(저장 안 함)
create or replace function agree_terms(ver text, birthdate date default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists (select 1 from consents where user_id = auth.uid() and kind = 'terms')
     and (birthdate is null or age(current_date, birthdate) < interval '14 years') then
    raise exception '만 14세 이상만 이용할 수 있어요';
  end if;
  insert into consents (user_id, kind, version) values (auth.uid(), 'terms', ver)
  on conflict (user_id, kind) do update set version = excluded.version, agreed_at = now();
end $$;
revoke execute on function agree_terms(text, date) from public, anon;
grant execute on function agree_terms(text, date) to authenticated;

-- 건의·신고: 도배 방지(005 와 같음) + 1년 지난 기록 삭제(개인정보처리방침 3번)
create or replace function feedback_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from feedback where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception '잠시 후 다시 보내 주세요 (10분에 5건까지)';
  end if;
  delete from feedback where created_at < now() - interval '1 year';
  return new;
end $$;

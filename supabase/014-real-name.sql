-- 014: 가입할 때 닉네임 대신 성·이름 + 나라(11-05). 화면에 보이는 이름(nickname)은 나라에 맞춰 자동으로 만듦
--   한국·일본·중국·대만: 성+이름(한글·한자는 붙여서 '김갓생'), 그 밖: 이름 성('God Saeng')
--   이미 가입한 사람은 그대로(닉네임). 설정에서 성·이름을 넣으면 그때부터 실명 표시
-- 활동 지역(region)은 이제 GPS 기록으로 앱이 자동으로 채움(나라+도시 이름만). 직접 쓰던 값은 처음 한 번 비움
-- 여러 번 실행해도 안전
alter table profiles add column if not exists family_name text check (char_length(family_name) <= 20);
alter table profiles add column if not exists given_name text check (char_length(given_name) <= 30);
alter table profiles add column if not exists country text not null default 'KR' check (char_length(country) between 2 and 3);
alter table profiles drop constraint if exists profiles_nickname_check;
alter table profiles add constraint profiles_nickname_check check (char_length(nickname) between 1 and 40);

create or replace function profile_name() returns trigger
language plpgsql set search_path = public as $$
begin
  new.family_name := nullif(trim(new.family_name), ''); new.given_name := nullif(trim(new.given_name), '');
  if new.family_name is not null and new.given_name is not null then
    new.nickname := left(case
      when new.country in ('KR', 'JP', 'CN', 'TW') and new.family_name || new.given_name !~ '[A-Za-z]' then new.family_name || new.given_name
      when new.country in ('KR', 'JP', 'CN', 'TW') then new.family_name || ' ' || new.given_name
      else new.given_name || ' ' || new.family_name end, 40);
  end if;
  return new;
end $$;
drop trigger if exists profile_name on profiles;
create trigger profile_name before insert or update of family_name, given_name, country on profiles for each row execute function profile_name();

-- 가입 직후 프로필: 성·이름·나라를 받으면 그걸로(008 과 같고 이름 칸만 추가)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname, avatar_url, family_name, given_name, country) values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '갓생러'), 20),
    null,
    left(new.raw_user_meta_data->>'family_name', 20), left(new.raw_user_meta_data->>'given_name', 30),
    coalesce(left(new.raw_user_meta_data->>'country', 3), 'KR'))
  on conflict do nothing;
  if new.raw_user_meta_data ? 'terms_version' then
    insert into consents (user_id, kind, version) values (new.id, 'terms', new.raw_user_meta_data->>'terms_version')
    on conflict (user_id, kind) do nothing;
  end if;
  return new;
end $$;

-- 활동 지역: 예전 직접 입력값은 처음 실행 때 한 번만 비움(이후는 앱이 GPS로 채움)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'region_gps') then
    alter table profiles add column region_gps boolean not null default false;
    update profiles set region = null;
  end if;
end $$;

-- 020: 카카오·구글 간편 로그인(11-13). SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전
-- 008 의 '가입할 때 생년월일로 만 14세 확인'은 이메일 가입에만. 간편 가입은 생년월일을 줄 수 없으므로
-- 가입 뒤 첫 화면의 '약관 동의' 창에서 생년월일(만 14세 확인, 저장 안 함)·약관·실명을 받음(agree_terms 가 확인).
-- 동의 전에는 앱 화면이 동의 창에 막혀 아무것도 못 함
create or replace function check_signup_age() returns trigger
language plpgsql security definer set search_path = public as $$
declare bd date;
begin
  if coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email' then return new; end if;   -- 카카오·구글: 동의 창에서 확인
  begin bd := (new.raw_user_meta_data->>'birthdate')::date; exception when others then bd := null; end;
  if bd is null or age(current_date, bd) < interval '14 years' then
    raise exception '만 14세 이상만 가입할 수 있어요';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'birthdate';
  return new;
end $$;

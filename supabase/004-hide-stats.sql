-- 갓생살기 — 004: '심박·칼로리 숨기기'를 서버에서 처리 + 서버 시간대 한국시간
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 001 을 다시 실행했다면 002 → 004 순서로 다시 실행해야 함(정책이 지워짐).

-- 남의 기록은 이 함수로만 봄: 크루 공개 기록 + 숨긴 심박·칼로리는 빈칸(null)
-- ponytail: 볼 수 있는 기록 전체를 훑은 뒤 앱이 원하는 20개를 자름. 기록이 수만 건 쌓이면 기간 인자 추가
create or replace function crew_workouts() returns setof workouts
language plpgsql stable security definer set search_path = public as $$
declare w workouts;
begin
  for w in select * from workouts
    where user_id = auth.uid() or (visibility = 'crew' and shares_crew(user_id)) loop
    if w.user_id <> auth.uid() then
      if 'hr' = any(w.hide_stats) then w.avg_hr := null; end if;
      if 'kcal' = any(w.hide_stats) then w.kcal := null; end if;
    end if;
    return next w;
  end loop;
end $$;
revoke execute on function crew_workouts() from public, anon;
grant execute on function crew_workouts() to authenticated;

-- 반응·댓글 정책용: 이 기록을 볼 수 있나 (workouts 를 본인 전용으로 바꾸므로 따로 판단)
create or replace function can_see_workout(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workouts where id = wid
    and (user_id = auth.uid() or (visibility = 'crew' and shares_crew(user_id))))
$$;

-- workouts 표를 직접 읽는 건 본인 기록만
drop policy if exists w_sel on workouts;
create policy w_sel on workouts for select to authenticated using (user_id = auth.uid());

drop policy if exists r_sel on reactions;
drop policy if exists r_ins on reactions;
create policy r_sel on reactions for select to authenticated using (can_see_workout(workout_id));
create policy r_ins on reactions for insert to authenticated with check (user_id = auth.uid() and can_see_workout(workout_id));

drop policy if exists cm_sel on comments;
drop policy if exists cm_ins on comments;
create policy cm_sel on comments for select to authenticated using (can_see_workout(workout_id));
create policy cm_ins on comments for insert to authenticated with check (user_id = auth.uid() and can_see_workout(workout_id));

-- 서버 시간대: 날짜 계산(오늘·이번 주)을 한국시간 기준으로. 저장된 시각 자체는 바뀌지 않음
alter database postgres set timezone to 'Asia/Seoul';

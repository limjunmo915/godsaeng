-- 갓생살기 — 011: 전체 화면 프로필 페이지용 숫자(팔로잉·팔로워·운동·연속 주·이번 달) + 함께 아는 친구
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전. (010 의 profile_preview 를 칸을 늘려 다시 만듦)
-- 숫자는 '크루·친구 공개' 기록만 셈('나만 보기'는 안 셈). 기록 내용은 안 돌려줌

-- 연속 주: 이번 주(없으면 지난주)부터 거슬러 1회 이상 운동한 주가 이어진 수(월요일 시작, 한국시간)
create or replace function week_streak(uid uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare wk date := date_trunc('week', now())::date; n int := 0;
begin
  if not exists (select 1 from workouts where user_id = uid and visibility = 'crew' and date_trunc('week', started_at)::date = wk) then
    wk := wk - 7;
  end if;
  while exists (select 1 from workouts where user_id = uid and visibility = 'crew' and date_trunc('week', started_at)::date = wk) loop
    n := n + 1; wk := wk - 7;
  end loop;
  return n;
end $$;
revoke execute on function week_streak(uuid) from public, anon;

drop function if exists profile_preview(uuid);
create function profile_preview(uid uuid)
returns table (id uuid, nickname text, avatar_url text, region text, bio text,
               following_count int, follower_count int, friend_count int, activity_count int, week_streak int,
               month_count int, month_minutes numeric, top_type text, last_type text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url, p.region, p.bio,
    (select count(*)::int from follows where follower = p.id),
    (select count(*)::int from follows where followee = p.id),
    (select count(*)::int from follows a join follows b on b.follower = a.followee and b.followee = a.follower where a.follower = p.id),
    (select count(*)::int from workouts w where w.user_id = p.id and w.visibility = 'crew'),
    week_streak(p.id),
    (select count(*)::int from workouts w where w.user_id = p.id and w.visibility = 'crew' and w.started_at >= date_trunc('month', now())),
    (select coalesce(sum(w.duration_min), 0) from workouts w where w.user_id = p.id and w.visibility = 'crew' and w.started_at >= date_trunc('month', now())),
    (select w.type from workouts w where w.user_id = p.id and w.visibility = 'crew' and w.started_at >= now() - interval '90 days'
      group by w.type order by count(*) desc limit 1),
    l.type, l.started_at
  from profiles p
  left join lateral (select w.type, w.started_at from workouts w where w.user_id = p.id and w.visibility = 'crew'
                     order by w.started_at desc limit 1) l on true
  where p.id = uid and auth.uid() is not null and not is_blocked(auth.uid(), p.id)
    and (p.searchable or shares_crew(p.id)
         or exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = p.id) or (f.follower = p.id and f.followee = auth.uid())))
$$;
revoke execute on function profile_preview(uuid) from public, anon;
grant execute on function profile_preview(uuid) to authenticated;

-- 함께 아는 친구: 나와도 친구이고 그 사람과도 친구인 사람(최대 20명)
create or replace function mutual_friends(uid uuid) returns table (id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url from profiles p
  where auth.uid() is not null and p.id <> uid and p.id <> auth.uid() and not is_blocked(auth.uid(), uid)
    and is_friend(p.id)
    and exists (select 1 from follows a join follows b on b.follower = a.followee and b.followee = a.follower
                where a.follower = uid and a.followee = p.id)
  order by p.nickname limit 20
$$;
revoke execute on function mutual_friends(uuid) from public, anon;
grant execute on function mutual_friends(uuid) to authenticated;

-- 팔로잉·팔로워 목록(숫자 누르면): 그 사람 프로필을 볼 수 있는 사람만, 검색 노출 끈 사람은 나와 관계있을 때만
create or replace function follow_list(uid uuid, which text) returns table (id uuid, nickname text, avatar_url text, region text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url, p.region from follows f
  join profiles p on p.id = case when which = 'following' then f.followee else f.follower end
  where (case when which = 'following' then f.follower else f.followee end) = uid
    and exists (select 1 from profile_preview(uid))
    and not is_blocked(auth.uid(), p.id)
    and (p.searchable or p.id = auth.uid() or shares_crew(p.id))
  order by p.nickname limit 200
$$;
revoke execute on function follow_list(uuid, text) from public, anon;
grant execute on function follow_list(uuid, text) to authenticated;

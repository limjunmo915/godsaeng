-- 갓생살기 — 010: 미리보기 프로필(활동 지역·한 줄 소개·운동 요약·잠긴 최근 활동) + 프로필 사진 공개 범위
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 프로필 사진: 작은 사진(avatar-시각.jpg) = 검색에 노출된 사람이면 누구나 / 큰 사진(avatar-시각-l.jpg) = 내가 팔로우한 사람만
--              (같은 크루·친구는 원래 정책 ph_sel 로 둘 다 보임)

alter table profiles add column if not exists region text check (char_length(region) <= 20);  -- 활동 지역(직접 입력, 선택)
alter table profiles add column if not exists bio text check (char_length(bio) <= 40);         -- 한 줄 소개(선택)

-- 프로필 사진을 볼 수 있나 (large = 크게 보기용 사진)
create or replace function can_view_avatar(owner uuid, large boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select not is_blocked(auth.uid(), owner) and case
    when large then exists (select 1 from follows where follower = auth.uid() and followee = owner)
    else exists (select 1 from profiles where id = owner and searchable)
      or exists (select 1 from follows where (follower = auth.uid() and followee = owner) or (follower = owner and followee = auth.uid()))
  end
$$;
drop policy if exists ph_av on storage.objects;
create policy ph_av on storage.objects for select to authenticated using (
  bucket_id = 'photos' and storage.filename(name) like 'avatar-%'
  and can_view_avatar(((storage.foldername(name))[1])::uuid, storage.filename(name) like '%-l.jpg'));

-- 미리보기 프로필: 검색에 노출됐거나 크루·친구·팔로우 관계인 사람만. 기록 내용은 안 주고 횟수·종목·날짜만
create or replace function profile_preview(uid uuid)
returns table (id uuid, nickname text, avatar_url text, region text, bio text,
               month_count int, top_type text, last_type text, last_at timestamptz, friend_count int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url, p.region, p.bio,
    (select count(*)::int from workouts w where w.user_id = p.id and w.visibility = 'crew' and w.started_at >= date_trunc('month', now())),
    (select w.type from workouts w where w.user_id = p.id and w.visibility = 'crew' and w.started_at >= now() - interval '90 days'
      group by w.type order by count(*) desc limit 1),
    l.type, l.started_at,
    (select count(*)::int from follows a join follows b on b.follower = a.followee and b.followee = a.follower where a.follower = p.id)
  from profiles p
  left join lateral (select w.type, w.started_at from workouts w where w.user_id = p.id and w.visibility = 'crew'
                     order by w.started_at desc limit 1) l on true
  where p.id = uid and auth.uid() is not null and not is_blocked(auth.uid(), p.id)
    and (p.searchable or shares_crew(p.id)
         or exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = p.id) or (f.follower = p.id and f.followee = auth.uid())))
$$;
revoke execute on function profile_preview(uuid) from public, anon;
grant execute on function profile_preview(uuid) to authenticated;

-- 검색 결과에 활동 지역도 함께(돌려주는 칸이 바뀌어 다시 만듦)
drop function if exists search_users(text);
create function search_users(q text) returns table (id uuid, nickname text, avatar_url text, region text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url, p.region from profiles p
  where char_length(trim(q)) >= 2 and p.searchable and p.id <> auth.uid() and not is_blocked(auth.uid(), p.id)
    and p.nickname ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.nickname limit 20
$$;
revoke execute on function search_users(text) from public, anon;
grant execute on function search_users(text) to authenticated;

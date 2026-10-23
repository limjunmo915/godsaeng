-- 갓생살기 — 006: 앱 안에서 탈퇴(계정 + 모든 데이터 삭제)
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- 사진 파일은 앱이 먼저 지우고(저장소 API) 이 함수를 부름. DB 데이터는 전부 profiles 에서 cascade 로 지워짐
-- (기록·사진 경로·비공개 메모·반응·댓글·약올리기·장비·신체 기록·건의). 신고 대상(feedback.target_user)은 빈칸으로 남음

create or replace function delete_me() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login required'; end if;
  -- 내가 만든 크루는 남은 멤버 중 가장 먼저 가입한 사람에게 넘김(남은 사람이 없으면 크루도 함께 삭제)
  update crews c set created_by = (
      select m.user_id from crew_members m where m.crew_id = c.id and m.user_id <> me order by m.joined_at limit 1)
    where c.created_by = me
      and exists (select 1 from crew_members m where m.crew_id = c.id and m.user_id <> me);
  -- 내가 만든 챌린지는 그 크루 주인에게 넘김(크루원이 같이 하던 챌린지가 사라지지 않게)
  update challenges ch set created_by = c.created_by
    from crews c where ch.crew_id = c.id and ch.created_by = me and c.created_by <> me;
  delete from auth.users where id = me;
end $$;
revoke execute on function delete_me() from public, anon;
grant execute on function delete_me() to authenticated;

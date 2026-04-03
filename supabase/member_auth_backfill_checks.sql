select count(*) as members_without_auth_user_id
from public.members
where auth_user_id is null;

select id, first_name, last_name, email, email_verified, is_approved, created_at
from public.members
where auth_user_id is null
  and (email is null or btrim(email) = '')
order by created_at asc;

select lower(btrim(email)) as normalized_email, count(*) as member_count
from public.members
where auth_user_id is null
  and email is not null
  and btrim(email) <> ''
group by lower(btrim(email))
having count(*) > 1
order by member_count desc, normalized_email asc;

select id, first_name, last_name, email, email_verified, is_approved, auth_user_id, created_at
from public.members
where auth_user_id is null
order by created_at asc;
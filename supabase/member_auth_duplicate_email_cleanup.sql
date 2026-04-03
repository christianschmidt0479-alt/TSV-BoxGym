-- Duplicate member emails currently skipped by the auth backfill.
-- Use this file only after deciding which member should keep which login email.

-- Recommended execution for the current data:
-- 1. Keep shared family emails only on parent_accounts for child-only cases.
-- 2. Keep chr.schmidt79@web.de on the adult member row.
-- 3. Remove duplicate member-login emails from the two Wieding children and from Christian Klein.

-- Ready-to-run version:
-- begin;
-- update public.members
-- set
--   email = null,
--   email_verified = false,
--   email_verified_at = null,
--   email_verification_token = null,
--   auth_user_id = null
-- where id in (
--   'b6e37598-a6a4-4b46-8232-aee9891169a6', -- Valentin Wieding
--   'e6210e04-d8a8-44ee-b963-fefef67a447f', -- Emanuel Wieding
--   '611ef0d3-6003-42fc-912b-041077ee9ea5'  -- Christian Klein
-- );
-- commit;

-- Current duplicate set
select id, first_name, last_name, birthdate, email, email_verified, is_approved, base_group, guardian_name, phone, created_at
from public.members
where email in ('k-wieding@t-online.de', 'chr.schmidt79@web.de')
order by email asc, birthdate asc;

select id, parent_name, email, phone
from public.parent_accounts
where email in ('k-wieding@t-online.de', 'chr.schmidt79@web.de')
order by email asc;

-- Pair 1: Wieding siblings
-- Both rows are Boxzwerge members and the same address already exists as a parent account.
-- Safest option if the children should NOT have their own member login:
-- clear the member email on both child rows and keep the shared address only on parent_accounts.

-- begin;
-- update public.members
-- set
--   email = null,
--   email_verified = false,
--   email_verified_at = null,
--   email_verification_token = null,
--   auth_user_id = null
-- where id in (
--   'b6e37598-a6a4-4b46-8232-aee9891169a6', -- Valentin Wieding
--   'e6210e04-d8a8-44ee-b963-fefef67a447f'  -- Emanuel Wieding
-- );
-- commit;

-- Pair 2: chr.schmidt79@web.de
-- This address exists both on a parent account (Familie Klein) and on two member rows:
--   611ef0d3-6003-42fc-912b-041077ee9ea5  Christian Klein (Boxzwerge child)
--   d4d34e6e-ef89-4959-b188-f8afefb92c53  Chr Sch (adult member)
-- Choose ONE of the following strategies.

-- Option A: Keep the address on the adult member, remove it from the child member.
-- Recommended if the child should use parent access only.
-- begin;
-- update public.members
-- set
--   email = null,
--   email_verified = false,
--   email_verified_at = null,
--   email_verification_token = null,
--   auth_user_id = null
-- where id = '611ef0d3-6003-42fc-912b-041077ee9ea5'; -- Christian Klein
-- commit;

-- Option B: Keep the address on the child member, give the adult member a different unique address.
-- Replace the placeholder before running.
-- begin;
-- update public.members
-- set
--   email = 'REPLACE_WITH_UNIQUE_EMAIL@example.com',
--   email_verified = false,
--   email_verified_at = null,
--   email_verification_token = null,
--   auth_user_id = null
-- where id = 'd4d34e6e-ef89-4959-b188-f8afefb92c53'; -- Chr Sch
-- commit;

-- After resolving duplicates, rerun the backfill:
-- npm run backfill:member-auth
-- Tofu (2026-10-25): a user an administrator adds on the Users page takes one of the places the app's Tofu plan has
-- room for, like every other account (TOFU.md, "Accounts and sign-up"). Tofu holds that number where each account is
-- made: the auth service asks Tofu's check, `tofu_hosting.before_user_created`, just before it creates an account,
-- and Tofu's own Add by email counts before it adds one. Neither sees an account written straight into `auth.users`,
-- which is how `tofu_add_sale` (20261025210000_tofu_without_edge_functions.sql) makes one, so from this file on it asks
-- the same check first, whenever Tofu has written it into this database, and refuses with the check's own words when
-- the app is full. Tofu writes that function as `postgres`, the role these files run as and the owner of this one, so
-- this function may run it. Everything else is as before. This file makes no table.
create or replace function public.tofu_add_sale(
  email text,
  first_name text,
  last_name text,
  administrator boolean default false,
  disabled boolean default false,
  password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.sales;
  address text := lower(trim(coalesce(tofu_add_sale.email, '')));
  account uuid;
  made public.sales;
  verdict jsonb;
begin
  select * into me from public.sales s where s.user_id = auth.uid();
  if me.id is null or not me.administrator then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if address !~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$' then
    raise exception 'Invalid email: %', address using errcode = '22023';
  end if;
  if coalesce(trim(tofu_add_sale.first_name), '') = '' or coalesce(trim(tofu_add_sale.last_name), '') = '' then
    raise exception 'A first and a last name are required' using errcode = '22023';
  end if;
  if tofu_add_sale.password is not null and length(tofu_add_sale.password) < 6 then
    raise exception 'The password must be at least 6 characters long' using errcode = '22023';
  end if;
  if public.tofu_sale_email_taken(address, null) then
    raise exception 'Email already used by another user: %', address
      using errcode = '23505', hint = 'email_taken', detail = address;
  end if;

  select u.id into account from auth.users u where lower(u.email) = address and u.deleted_at is null
    order by u.created_at limit 1;
  if account is null then
    -- the lock the new-account guard takes, so two users added at once are counted one after the other
    perform pg_advisory_xact_lock(hashtext('atomic_crm.new_account'));
    -- Tofu's check of the plan's number of people, asked as the auth service asks it before it creates an account
    -- (it counts the accounts already there and does not read the event)
    if to_regprocedure('tofu_hosting.before_user_created(jsonb)') is not null then
      execute 'select tofu_hosting.before_user_created($1)'
        into verdict
        using jsonb_build_object(
          'metadata', jsonb_build_object('name', 'before-user-created'),
          'user', jsonb_build_object('email', address, 'is_anonymous', false));
      if verdict -> 'error' is not null then
        raise exception '%', coalesce(nullif(verdict #>> '{error,message}', ''),
            'This app is full: it has no room for new people right now.')
          using errcode = 'P0001', hint = 'app_full';
      end if;
    end if;
    -- what the auth service's admin create writes for a confirmed email account (Tofu's own add writes the same)
    account := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, email_change_confirm_status, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', account, 'authenticated', 'authenticated', address,
      case when tofu_add_sale.password is null then null
        else extensions.crypt(tofu_add_sale.password, extensions.gen_salt('bf', 10)) end,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'atomic_crm_added_by_admin', true),
      jsonb_build_object('first_name', trim(tofu_add_sale.first_name), 'last_name', trim(tofu_add_sale.last_name)),
      now(), now(), '', '', '', '', '', '', '', '', 0, false, false);
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (account::text, account,
      jsonb_build_object('sub', account::text, 'email', address, 'email_verified', true, 'phone_verified', false),
      'email', now(), now());
  else
    -- upstream's case of an account left without its CRM user (a database emptied without its accounts)
    if exists (select 1 from public.sales s where s.user_id = account) then
      raise exception 'A user for this email already exists' using errcode = '23505';
    end if;
    update auth.users u
      set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('first_name', trim(tofu_add_sale.first_name), 'last_name', trim(tofu_add_sale.last_name)),
          updated_at = now()
      where u.id = account;
    insert into public.sales (first_name, last_name, email, user_id, administrator)
    values (trim(tofu_add_sale.first_name), trim(tofu_add_sale.last_name), address, account, false)
    on conflict (user_id) do nothing;
  end if;

  update public.sales s
    set administrator = coalesce(tofu_add_sale.administrator, false),
        disabled = coalesce(tofu_add_sale.disabled, false)
    where s.user_id = account
    returning * into made;
  if coalesce(tofu_add_sale.disabled, false) then
    update auth.users u set banned_until = now() + interval '87600 hours' where u.id = account;
  end if;
  return to_jsonb(made);
end;
$$;

revoke all on function public.tofu_add_sale(text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.tofu_add_sale(text, text, text, boolean, boolean, text) to authenticated;

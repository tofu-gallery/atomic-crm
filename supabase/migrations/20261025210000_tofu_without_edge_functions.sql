-- Tofu (2026-10-25): what upstream's Supabase Edge Functions did, done in the database instead (TOFU.md, "What we
-- changed"). Tofu deploys no Edge Function for a copy of this app, so the pages call these functions through the
-- Data API, and the browser does the rest: it asks for password emails itself and removes a note's files from
-- storage. This file makes no table.

-- 1. New accounts. Upstream's pages let one person sign up, the first, who becomes the administrator, and every
-- other user is created by an administrator; but the auth service itself took any sign-up sent to it, and every
-- signed-in account can read and change all of the CRM's data. From now on the database refuses a new account once
-- the CRM has its first user, unless an administrator added it (`tofu_add_sale`, below), the owner added it from
-- Tofu (the People card marks it `tofu_added_by_owner`), or it comes from single sign-on the auth service's
-- administrator set up. Neither mark can be set by someone signing up: it lives in the account's app metadata.
create or replace function public.tofu_guard_new_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- one new account at a time, so two first sign-ups at once cannot both become the administrator
  perform pg_advisory_xact_lock(hashtext('atomic_crm.new_account'));
  if not exists (select 1 from public.sales) then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data ->> 'atomic_crm_added_by_admin', '') = 'true'
     or coalesce(new.raw_app_meta_data ->> 'tofu_added_by_owner', '') = 'true'
     or coalesce(new.is_sso_user, false) then
    return new;
  end if;
  raise exception 'Sign-up is closed: ask an administrator of this CRM to add you.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists tofu_guard_new_account on auth.users;
create trigger tofu_guard_new_account
  before insert on auth.users
  for each row execute function public.tofu_guard_new_account();

revoke all on function public.tofu_guard_new_account() from public, anon, authenticated;

-- The rules upstream's `users` function applied to email addresses.
create or replace function public.tofu_sale_email_taken(address text, except_sale bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where (except_sale is null or s.id <> except_sale)
      and (lower(s.email::text) = address or s.secondary_emails @> jsonb_build_array(address))
  );
$$;

revoke all on function public.tofu_sale_email_taken(text, bigint) from public, anon, authenticated;

-- 2. Creating a user: upstream's `POST /functions/v1/users`. An administrator gives a name, an address and, if they
-- like, a first password; the account is made the way the auth service's own admin create makes a confirmed one,
-- and the CRM user with it (through upstream's `on_auth_user_created` trigger). Without a password the person sets
-- one with the password email the page asks for, or with "Forgot password?" on the sign-in page.
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

-- 3. Changing a user: upstream's `PATCH /functions/v1/users`. Anyone may change their own name, address, other
-- addresses and picture; an administrator may change anyone's, and alone may make someone an administrator or
-- disable them, which signs them out of the auth service until they are enabled again. Arguments left null keep
-- what they hold. Names are written into the account's metadata too, which upstream's `on_auth_user_updated` trigger
-- copies back into `sales` on every change to the account (a sign-in included).
create or replace function public.tofu_update_sale(
  sales_id bigint,
  email text default null,
  secondary_emails jsonb default null,
  first_name text default null,
  last_name text default null,
  avatar jsonb default null,
  administrator boolean default null,
  disabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.sales;
  target public.sales;
  address text;
  others jsonb;
  other text;
  made public.sales;
begin
  select * into me from public.sales s where s.user_id = auth.uid();
  if me.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into target from public.sales s where s.id = tofu_update_sale.sales_id;
  if target.id is null then
    raise exception 'Not Found' using errcode = 'P0002';
  end if;
  if not me.administrator and me.id <> target.id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  address := lower(trim(coalesce(tofu_update_sale.email, target.email::text)));
  if address !~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$' then
    raise exception 'Invalid email: %', address using errcode = '22023';
  end if;
  if address <> lower(target.email::text) and public.tofu_sale_email_taken(address, target.id) then
    raise exception 'Email already used by another user: %', address
      using errcode = '23505', hint = 'email_taken', detail = address;
  end if;

  if tofu_update_sale.secondary_emails is not null then
    if jsonb_typeof(tofu_update_sale.secondary_emails) <> 'array' then
      raise exception 'secondary_emails must be an array' using errcode = '22023', hint = 'invalid_secondary_emails_payload';
    end if;
    select coalesce(jsonb_agg(e order by first_at), '[]'::jsonb) into others
    from (
      select lower(trim(v #>> '{}')) as e, min(ord) as first_at
      from jsonb_array_elements(tofu_update_sale.secondary_emails) with ordinality as t(v, ord)
      where jsonb_typeof(v) = 'string' and trim(v #>> '{}') <> ''
      group by lower(trim(v #>> '{}'))
    ) normalized;
    if jsonb_array_length(others) > 10 then
      raise exception 'No more than 10 secondary emails are allowed' using errcode = '22023', hint = 'too_many_secondary_emails';
    end if;
    for other in select jsonb_array_elements_text(others) loop
      if other !~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$' then
        raise exception 'Invalid secondary email: %', other using errcode = '22023', hint = 'invalid_secondary_email', detail = other;
      end if;
      if public.tofu_sale_email_taken(other, target.id) then
        raise exception 'Secondary email already used by another user: %', other
          using errcode = '23505', hint = 'secondary_email_taken', detail = other;
      end if;
    end loop;
  else
    others := coalesce(target.secondary_emails, '[]'::jsonb);
  end if;
  if others @> jsonb_build_array(address) then
    raise exception 'Secondary email is already the main address: %', address
      using errcode = '23505', hint = 'secondary_email_is_primary', detail = address;
  end if;

  update auth.users u
    set email = address,
        raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'first_name', nullif(trim(tofu_update_sale.first_name), ''),
          'last_name', nullif(trim(tofu_update_sale.last_name), ''))),
        banned_until = case
          when me.administrator and tofu_update_sale.disabled is true then now() + interval '87600 hours'
          when me.administrator and tofu_update_sale.disabled is false then null
          else u.banned_until end,
        updated_at = now()
    where u.id = target.user_id;
  if address <> lower(target.email::text) then
    update auth.identities i
      set identity_data = coalesce(i.identity_data, '{}'::jsonb) || jsonb_build_object('email', address),
          updated_at = now()
      where i.user_id = target.user_id and i.provider = 'email';
  end if;

  update public.sales s
    set email = address,
        first_name = coalesce(nullif(trim(tofu_update_sale.first_name), ''), s.first_name),
        last_name = coalesce(nullif(trim(tofu_update_sale.last_name), ''), s.last_name),
        secondary_emails = others,
        avatar = coalesce(tofu_update_sale.avatar, s.avatar),
        administrator = case when me.administrator and tofu_update_sale.administrator is not null
          then tofu_update_sale.administrator else s.administrator end,
        disabled = case when me.administrator and tofu_update_sale.disabled is not null
          then tofu_update_sale.disabled else s.disabled end
    where s.id = target.id
    returning * into made;
  return to_jsonb(made);
end;
$$;

revoke all on function public.tofu_update_sale(bigint, text, jsonb, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.tofu_update_sale(bigint, text, jsonb, text, text, jsonb, boolean, boolean) to authenticated;

-- 4. Merging contacts: upstream's `merge_contacts` function ran the same steps as this file's SQL function of the
-- same name, as the signed-in user; the page now calls the SQL function itself.
revoke all on function public.merge_contacts(bigint, bigint) from public, anon;
grant execute on function public.merge_contacts(bigint, bigint) to authenticated;

-- 5. A note's files: upstream's triggers called the `delete_note_attachments` function through `pg_net`, which is
-- not installed here (and a trigger calling it would make every note deletion fail). The app removes the files.
drop trigger if exists on_contact_notes_deleted_delete_note_attachments on public.contact_notes;
drop trigger if exists on_deal_notes_deleted_delete_note_attachments on public.deal_notes;
drop trigger if exists on_contact_notes_attachments_updated_delete_note_attachments on public.contact_notes;
drop trigger if exists on_deal_notes_attachments_updated_delete_note_attachments on public.deal_notes;
drop function if exists public.cleanup_note_attachments();
drop function if exists public.get_note_attachments_function_url();

-- 6. Only upstream's `users` function, with the server key, looked accounts up by address.
revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;

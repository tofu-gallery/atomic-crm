-- Tofu (2026-11-05): upstream's 20261030125021_user_invitations.sql makes `handle_new_user` (upstream's
-- `on_auth_user_created` trigger, which makes each account's CRM user) refuse every account after the first one
-- unless upstream's `users` Edge Function wrote the account's id into `user_invitations` first, or the account comes
-- from single sign-on. Tofu deploys no Edge Function (TOFU.md, "What we changed"), and the two ways Tofu adds a person
-- write no such row: `tofu_add_sale` (the app's Users page, which marks the account `atomic_crm_added_by_admin`;
-- 20261025210000_tofu_without_edge_functions.sql) and Tofu's People card (Add by email, which marks it
-- `tofu_added_by_owner`). Without this file both would be refused with "Sign up is not allowed" once the CRM has its
-- first user. So the function below is upstream's new one, word for word, but for those two marks, which it lets
-- through as `tofu_guard_new_account` does. Neither can be set by someone signing up: they live in the account's app
-- metadata. Every other account still needs its invitation row or single sign-on, as upstream has it, and
-- `tofu_guard_new_account` (before insert) still refuses it first, with its own sentence. A new file rather than a
-- change to the ones before, because Tofu applies each file once; named to run right after upstream's. This file
-- makes no table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  delete from public.user_invitations where user_id = new.id;
  if sales_count > 0 and not found and not new.is_sso_user
     and coalesce(new.raw_app_meta_data ->> 'atomic_crm_added_by_admin', '') <> 'true'
     and coalesce(new.raw_app_meta_data ->> 'tofu_added_by_owner', '') <> 'true' then
    raise exception 'Sign up is not allowed';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );
  return new;
end;
$function$;

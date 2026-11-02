-- Kundin löscht ihr Konto selbst («Mein Konto» -> «Konto löschen»),
-- Pflicht für App Store (Richtlinie 5.1.1(v)) und Google Play.
--
-- erase_customer_data() ist der gemeinsame Kern für die Admin-Löschung
-- (delete_customer_permanently) und die Selbstlöschung
-- (delete_own_account_data, nur über die Edge Function delete-account mit
-- service_role). Gelöscht/anonymisiert wird wie in
-- 202611010006_delete_customer_permanently.sql beschrieben; Rechnungen und
-- Zahlungen bleiben (Aufbewahrungspflicht). Bei der Selbstlöschung werden
-- kommende Termine vorher storniert, und Liliane erhält die Storno-Infos
-- sowie eine Info «Konto gelöscht».

create or replace function public.erase_customer_data(target_customer_id uuid, target_profile_id uuid, keep_owner_notices boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  customer_row public.customers;
  profile_email text;
  email_key text;
  name_key text;
  appointment_ids uuid[];
  preview_paths text[] := '{}';
  result jsonb := '{}'::jsonb;
  affected integer;
begin
  if target_customer_id is not null then
    select * into customer_row from public.customers where id = target_customer_id for update;
  end if;
  target_profile_id := coalesce(target_profile_id, customer_row.profile_id);
  if target_profile_id is not null then
    select email into profile_email from public.profiles where id = target_profile_id;
  end if;
  email_key := nullif(lower(btrim(coalesce(customer_row.email, profile_email, ''))), '');
  name_key := lower(btrim(coalesce(customer_row.full_name, '')));

  select array_agg(id) into appointment_ids from public.appointments
  where not is_private and ((customer_row.id is not null and customer_ref_id = customer_row.id)
    or (target_profile_id is not null and (customer_id = target_profile_id or created_by = target_profile_id))
    or (email_key is not null and lower(customer_email) = email_key));
  appointment_ids := coalesce(appointment_ids, '{}');

  perform set_config('gigi.skip_customer_sync', 'on', true);
  update public.appointments set customer_name = 'Gelöschte Kundin', customer_email = null, customer_phone = null,
    notes = null, customer_ref_id = null, customer_id = null,
    created_by = case when created_by = target_profile_id then null else created_by end
  where id = any(appointment_ids);
  get diagnostics affected = row_count; result := result || jsonb_build_object('appointments_anonymized', affected);
  perform set_config('gigi.skip_customer_sync', 'off', true);

  delete from public.waitlist_entries
  where (customer_row.id is not null and customer_id = customer_row.id)
     or (email_key is not null and lower(email) = email_key)
     or (target_profile_id is not null and created_by = target_profile_id);
  get diagnostics affected = row_count; result := result || jsonb_build_object('waitlist_deleted', affected);

  -- Mails an die Kundin und interne Info-Mails über ihre Termine.
  delete from public.email_outbox
  where (not keep_owner_notices or kind <> 'owner_notice')
    and ((email_key is not null and (lower(recipient_email) = email_key or lower(payload ->> 'customer_email') = email_key))
      or (payload ->> 'appointment_id') = any(select unnest(appointment_ids)::text));
  get diagnostics affected = row_count; result := result || jsonb_build_object('emails_deleted', affected);

  -- KI-Farbwünsche haben nur einen frei eingegebenen Namen -> nur bei
  -- eindeutigem Namen löschen.
  if name_key <> '' and (select count(*) from public.customers where lower(btrim(full_name)) = name_key) = 1 then
    select coalesce(array_agg(photo_path) filter (where photo_path is not null), '{}') into preview_paths
    from public.ai_preview_requests where lower(btrim(customer_name)) = name_key;
    delete from public.ai_preview_requests where lower(btrim(customer_name)) = name_key;
    get diagnostics affected = row_count; result := result || jsonb_build_object('ai_previews_deleted', affected);
  end if;

  if customer_row.id is not null then
    delete from public.customers where id = customer_row.id;
  end if;

  if target_profile_id is not null then
    -- Verweise auf profiles (Rechnungen, Protokoll usw.) werden per
    -- ON DELETE SET NULL gelöst; profiles selbst per cascade.
    delete from auth.users where id = target_profile_id;
    result := result || jsonb_build_object('login_deleted', true);
  end if;

  -- Kopien im Änderungsprotokoll (inkl. der eben erzeugten) entfernen.
  delete from public.audit_log
  where (customer_row.id is not null and table_name = 'customers' and record_id = customer_row.id::text)
     or (table_name = 'appointments' and record_id = any(select unnest(appointment_ids)::text))
     or (target_profile_id is not null and table_name = 'profiles' and record_id = target_profile_id::text);

  return result || jsonb_build_object('customer_id', customer_row.id, 'preview_paths', to_jsonb(preview_paths));
end;
$$;

revoke execute on function public.erase_customer_data(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.delete_customer_permanently(target_customer_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  customer_row public.customers;
  email_key text;
  upcoming integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into customer_row from public.customers where id = target_customer_id;
  if customer_row.id is null then raise exception 'Kundenprofil nicht gefunden.'; end if;
  if customer_row.profile_id = auth.uid()
     or exists(select 1 from public.profiles where id = customer_row.profile_id and role = 'admin') then
    raise exception 'Ein Admin-Konto kann hier nicht gelöscht werden.';
  end if;
  email_key := nullif(lower(btrim(coalesce(customer_row.email, ''))), '');

  select count(*) into upcoming from public.appointments
  where not is_private and status = 'booked' and starts_at >= now()
    and (customer_ref_id = customer_row.id
      or (customer_row.profile_id is not null and customer_id = customer_row.profile_id)
      or (email_key is not null and lower(customer_email) = email_key));
  if upcoming > 0 then
    raise exception 'Die Kundin hat noch % kommende Termin(e). Bitte diese zuerst stornieren.', upcoming;
  end if;

  return public.erase_customer_data(customer_row.id, customer_row.profile_id, false);
end;
$$;

revoke execute on function public.delete_customer_permanently(uuid) from public, anon;
grant execute on function public.delete_customer_permanently(uuid) to authenticated;

create or replace function public.delete_own_account_data(target_profile_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  profile_row public.profiles;
  customer_row public.customers;
  email_key text;
  owner_email text;
  cancelled integer := 0;
begin
  select * into profile_row from public.profiles where id = target_profile_id;
  if profile_row.id is null then raise exception 'Konto nicht gefunden.'; end if;
  if profile_row.role = 'admin' then raise exception 'Ein Admin-Konto kann nicht selbst gelöscht werden.'; end if;
  select * into customer_row from public.customers where profile_id = target_profile_id limit 1;
  email_key := nullif(lower(btrim(coalesce(customer_row.email, profile_row.email, ''))), '');

  -- Kommende Termine stornieren: Liliane erhält wie gewohnt die
  -- Storno-Info, die Kundin keine Mail mehr (Konto wird gelöscht).
  update public.appointments set status = 'cancelled', cancelled_at = now(), notify_customer = false
  where not is_private and status = 'booked' and starts_at >= now()
    and ((customer_row.id is not null and customer_ref_id = customer_row.id)
      or customer_id = target_profile_id
      or (email_key is not null and lower(customer_email) = email_key));
  get diagnostics cancelled = row_count;

  select bs.admin_email into owner_email from public.business_settings bs where id = true;
  if nullif(btrim(coalesce(owner_email, '')), '') is not null then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('owner_notice', owner_email, 'Liliane',
      'Konto gelöscht: ' || coalesce(customer_row.full_name, profile_row.full_name, 'Kundin'),
      jsonb_build_object('event', 'account_deleted',
        'customer_name', coalesce(customer_row.full_name, profile_row.full_name, 'Kundin'),
        'cancelled_count', cancelled));
  end if;

  return public.erase_customer_data(customer_row.id, target_profile_id, true)
    || jsonb_build_object('appointments_cancelled', cancelled);
end;
$$;

revoke execute on function public.delete_own_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_own_account_data(uuid) to service_role;

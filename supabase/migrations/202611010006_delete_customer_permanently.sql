-- Kundin endgültig löschen (Dashboard, Kundenprofil -> "Kundin löschen").
--
-- Gelöscht: Kundenprofil inkl. Aufgaben, Kommunikation, Einwilligungen,
-- Pakete, Chat/Fotos (Tabellenzeilen per cascade, Dateien löscht das
-- Dashboard über die Storage-API), Wartelisten-Einträge, E-Mails im
-- Versand-Postfach, KI-Farbwünsche unter ihrem Namen, Login-Konto und alle
-- Kopien im Änderungsprotokoll.
-- Anonymisiert: vergangene Termine bleiben für Umsatz/Statistik als
-- "Gelöschte Kundin" ohne Kontaktdaten und Notizen.
-- Bleibt: Rechnungen und Zahlungen (gesetzliche Aufbewahrungspflicht).
-- Abgelehnt, solange noch kommende gebuchte Termine bestehen.

-- sync_appointment_customer() würde beim Anonymisieren sofort wieder eine
-- Kundin "Gelöschte Kundin" anlegen -> per Transaktions-Flag überspringen.
create or replace function public.sync_appointment_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  email_key text := nullif(lower(btrim(coalesce(new.customer_email, ''))), '');
  phone_digits text := right(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), 9);
  match_id uuid;
begin
  if new.is_private or current_setting('gigi.skip_customer_sync', true) = 'on' then return new; end if;

  if new.customer_ref_id is null and new.customer_id is not null then
    select id into new.customer_ref_id from public.customers where profile_id = new.customer_id;
  end if;
  if new.customer_ref_id is null and email_key is not null then
    select id into new.customer_ref_id from public.customers where lower(email) = email_key limit 1;
  end if;
  if new.customer_ref_id is null and public.is_admin() then
    if length(phone_digits) = 9 then
      select min(id::text)::uuid into match_id from public.customers
      where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = phone_digits
      having count(*) = 1;
      new.customer_ref_id := match_id;
    end if;
    if new.customer_ref_id is null then
      select min(id::text)::uuid into match_id from public.customers
      where lower(btrim(full_name)) = lower(btrim(new.customer_name))
      having count(*) = 1;
      new.customer_ref_id := match_id;
    end if;
  end if;

  if new.customer_ref_id is null then
    insert into public.customers(profile_id, full_name, email, phone)
    values (
      case when new.customer_id is not null and not exists(select 1 from public.customers where profile_id = new.customer_id) then new.customer_id end,
      btrim(new.customer_name), email_key, nullif(btrim(coalesce(new.customer_phone, '')), ''))
    returning id into new.customer_ref_id;
  else
    update public.customers c set
      email = coalesce(c.email, case when email_key is not null and not exists(select 1 from public.customers o where lower(o.email) = email_key and o.id <> c.id) then email_key end),
      phone = coalesce(c.phone, nullif(btrim(coalesce(new.customer_phone, '')), '')),
      profile_id = coalesce(c.profile_id, case when new.customer_id is not null and not exists(select 1 from public.customers o where o.profile_id = new.customer_id and o.id <> c.id) then new.customer_id end)
    where c.id = new.customer_ref_id
      and (c.email is null or c.phone is null or c.profile_id is null);
  end if;
  return new;
end;
$$;

create or replace function public.delete_customer_permanently(target_customer_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  customer_row public.customers;
  email_key text;
  name_key text;
  upcoming integer;
  appointment_ids uuid[];
  result jsonb := '{}'::jsonb;
  affected integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into customer_row from public.customers where id = target_customer_id for update;
  if customer_row.id is null then raise exception 'Kundenprofil nicht gefunden.'; end if;
  if customer_row.profile_id = auth.uid()
     or exists(select 1 from public.profiles where id = customer_row.profile_id and role = 'admin') then
    raise exception 'Ein Admin-Konto kann hier nicht gelöscht werden.';
  end if;
  email_key := nullif(lower(btrim(coalesce(customer_row.email, ''))), '');
  name_key := lower(btrim(customer_row.full_name));

  select array_agg(id) into appointment_ids from public.appointments
  where not is_private and (customer_ref_id = customer_row.id
    or (customer_row.profile_id is not null and customer_id = customer_row.profile_id)
    or (email_key is not null and lower(customer_email) = email_key));
  appointment_ids := coalesce(appointment_ids, '{}');

  select count(*) into upcoming from public.appointments
  where id = any(appointment_ids) and status = 'booked' and starts_at >= now();
  if upcoming > 0 then
    raise exception 'Die Kundin hat noch % kommende Termin(e). Bitte diese zuerst stornieren.', upcoming;
  end if;

  perform set_config('gigi.skip_customer_sync', 'on', true);
  update public.appointments set customer_name = 'Gelöschte Kundin', customer_email = null, customer_phone = null,
    notes = null, customer_ref_id = null, customer_id = null
  where id = any(appointment_ids);
  get diagnostics affected = row_count; result := result || jsonb_build_object('appointments_anonymized', affected);
  perform set_config('gigi.skip_customer_sync', 'off', true);

  delete from public.waitlist_entries where customer_id = customer_row.id or (email_key is not null and lower(email) = email_key);
  get diagnostics affected = row_count; result := result || jsonb_build_object('waitlist_deleted', affected);

  -- Mails an die Kundin und interne Info-Mails über ihre Termine.
  delete from public.email_outbox
  where (email_key is not null and (lower(recipient_email) = email_key or lower(payload ->> 'customer_email') = email_key))
     or (payload ->> 'appointment_id') = any(select unnest(appointment_ids)::text);
  get diagnostics affected = row_count; result := result || jsonb_build_object('emails_deleted', affected);

  -- KI-Farbwünsche haben nur einen frei eingegebenen Namen -> nur bei
  -- eindeutigem Namen löschen (Dateien entfernt das Dashboard vorher).
  if (select count(*) from public.customers where lower(btrim(full_name)) = name_key) = 1 then
    delete from public.ai_preview_requests where lower(btrim(customer_name)) = name_key;
    get diagnostics affected = row_count; result := result || jsonb_build_object('ai_previews_deleted', affected);
  end if;

  delete from public.customers where id = customer_row.id;

  if customer_row.profile_id is not null then
    delete from auth.users where id = customer_row.profile_id;
    result := result || jsonb_build_object('login_deleted', true);
  end if;

  -- Kopien im Änderungsprotokoll (inkl. der eben erzeugten) entfernen.
  delete from public.audit_log
  where (table_name = 'customers' and record_id = customer_row.id::text)
     or (table_name = 'appointments' and record_id = any(select unnest(appointment_ids)::text))
     or (customer_row.profile_id is not null and table_name = 'profiles' and record_id = customer_row.profile_id::text);

  return result;
end;
$$;

revoke execute on function public.delete_customer_permanently(uuid) from public, anon;
grant execute on function public.delete_customer_permanently(uuid) to authenticated;

-- Admin darf Kundenfotos und KI-Fotos löschen (Storage-API; direktes
-- DELETE auf storage.objects ist gesperrt).
drop policy if exists "customer photos admin delete" on storage.objects;
create policy "customer photos admin delete" on storage.objects for delete
  using (bucket_id = 'customer-photos' and public.is_admin());
drop policy if exists "ai preview photos admin delete" on storage.objects;
create policy "ai preview photos admin delete" on storage.objects for delete
  using (bucket_id = 'ai-preview-photos' and public.is_admin());

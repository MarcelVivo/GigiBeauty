-- merge_customers() korrigiert. Bisher:
--    - appointments.customer_ref_id wurde nicht umgehängt (on delete set
--      null) -> Termine verloren beim Zusammenführen ihre Kundin
--    - customer_media wurde nicht umgehängt (on delete cascade) -> Chat und
--      Fotos des Doppelprofils wurden mitgelöscht
--    - do_not_contact des Doppelprofils ging verloren
--    - legacy_booking_count nahm das Maximum, obwohl beide Profile
--      verschiedene Buchungen zählen (Treatwell-Import hat dieselbe Person
--      mit und ohne E-Mail getrennt angelegt) -> jetzt Summe
--    - doppelte offene Aufgaben blieben stehen
--    Logik in merge_customers_internal() (ohne Rechteprüfung, nur für
--    Migrationen), das RPC prüft weiterhin is_admin().
create or replace function public.merge_customers_internal(primary_customer_id uuid, duplicate_customer_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare primary_row public.customers; duplicate_row public.customers;
begin
  if primary_customer_id = duplicate_customer_id then return primary_customer_id; end if;
  select * into primary_row from public.customers where id = primary_customer_id for update;
  select * into duplicate_row from public.customers where id = duplicate_customer_id for update;
  if primary_row.id is null or duplicate_row.id is null then raise exception 'Kundenprofil nicht gefunden.'; end if;
  if primary_row.profile_id is not null and duplicate_row.profile_id is not null and primary_row.profile_id <> duplicate_row.profile_id then
    raise exception 'Zwei unterschiedliche Login-Konten können nicht automatisch zusammengeführt werden.';
  end if;

  update public.appointments set customer_ref_id = primary_row.id where customer_ref_id = duplicate_row.id;
  update public.customer_media set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.customer_communications set customer_id = primary_row.id where customer_id = duplicate_row.id;
  -- Offene Aufgabe gleichen Typs existiert schon beim Hauptprofil -> Duplikat weg.
  delete from public.crm_tasks d where d.customer_id = duplicate_row.id and d.status = 'open'
    and exists(select 1 from public.crm_tasks p where p.customer_id = primary_row.id and p.status = 'open' and p.task_type = d.task_type);
  update public.crm_tasks set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.waitlist_entries set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.payments set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.customer_packages set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.marketing_events set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.customer_consents set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.gift_cards set purchaser_customer_id = primary_row.id where purchaser_customer_id = duplicate_row.id;
  update public.customers set referred_by = primary_row.id where referred_by = duplicate_row.id and id <> primary_row.id;
  update public.customers set profile_id = null, email = null, external_reference = null where id = duplicate_row.id;

  update public.customers set
    profile_id = coalesce(primary_row.profile_id, duplicate_row.profile_id),
    full_name = case when primary_row.profile_id is null and duplicate_row.profile_id is not null then duplicate_row.full_name else primary_row.full_name end,
    email = coalesce(primary_row.email, duplicate_row.email),
    phone = coalesce(primary_row.phone, duplicate_row.phone),
    notes = nullif(concat_ws(E'\n', primary_row.notes, duplicate_row.notes), ''),
    tags = array(select distinct unnest(coalesce(primary_row.tags, '{}') || coalesce(duplicate_row.tags, '{}'))),
    language = coalesce(primary_row.language, duplicate_row.language),
    birth_date = coalesce(primary_row.birth_date, duplicate_row.birth_date),
    acquisition_source = coalesce(primary_row.acquisition_source, duplicate_row.acquisition_source),
    preferred_service_id = coalesce(primary_row.preferred_service_id, duplicate_row.preferred_service_id),
    marketing_consent = primary_row.marketing_consent or duplicate_row.marketing_consent,
    marketing_consent_at = coalesce(primary_row.marketing_consent_at, duplicate_row.marketing_consent_at),
    marketing_consent_source = coalesce(primary_row.marketing_consent_source, duplicate_row.marketing_consent_source),
    marketing_consent_version = coalesce(primary_row.marketing_consent_version, duplicate_row.marketing_consent_version),
    do_not_contact = primary_row.do_not_contact or duplicate_row.do_not_contact,
    legacy_booking_count = coalesce(primary_row.legacy_booking_count, 0) + coalesce(duplicate_row.legacy_booking_count, 0),
    last_contacted_at = greatest(primary_row.last_contacted_at, duplicate_row.last_contacted_at)
  where id = primary_row.id;

  -- Mit E-Mail ist "E-Mail ergänzen" erledigt.
  update public.crm_tasks set status = 'done', completed_at = now()
  where customer_id = primary_row.id and task_type = 'missing_email' and status = 'open'
    and exists(select 1 from public.customers where id = primary_row.id and email is not null);

  delete from public.customers where id = duplicate_row.id;
  return primary_row.id;
end;
$$;

revoke execute on function public.merge_customers_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.merge_customers(primary_customer_id uuid, duplicate_customer_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  return public.merge_customers_internal(primary_customer_id, duplicate_customer_id);
end;
$$;

-- Die einmalige Datenbereinigung vom 2026-11-01 (Doppelprofil zusammengeführt,
-- letzte unverknüpfte Termine zugeordnet) wurde direkt live ausgeführt und ist
-- hier bewusst nicht enthalten, weil sie Kundendaten enthält.

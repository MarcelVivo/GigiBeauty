-- Kundenkonto <-> Kundenkartei sauber verbinden (Go-Live 2026-11-01).
--
-- Behebt:
--  * Chat, Fotos und frühere Termine waren für Kundinnen leer: alle Regeln
--    fragten public.customers ab, die per RLS nur Admins lesen dürfen.
--    -> current_customer_id() (SECURITY DEFINER) liefert die eigene
--       Kunden-ID, Regeln/Frontend nutzen nur noch diese Funktion.
--  * Verknüpfung schon vor der E-Mail-Bestätigung: Wer sich mit einer
--    fremden Adresse registrierte, besetzte deren Kundenprofil.
--    -> Verknüpfung erst, wenn auth.users.email_confirmed_at gesetzt ist.
--  * Automatische Zuordnung allein über die Telefonnummer (Übernahme eines
--    Profils ohne E-Mail möglich) -> nur noch Hinweis-Aufgabe für Liliane.
--  * Registrierungs-Name überschrieb den Namen in der Kartei -> nur leere
--    Felder werden ergänzt.
--  * Newsletter-Abmeldung im Konto wirkte nicht (marketing_consent wurde
--    nur ODER-verknüpft) -> Änderung im Profil wird 1:1 übernommen.
--  * Frühere Termine aus der Kartei fehlten im Kundenkonto -> RPC
--    my_appointments() mit unbedenklichen Spalten (keine internen Notizen).

-- 1) Eigene Kunden-ID ---------------------------------------------------
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.customers where profile_id = auth.uid() limit 1;
$$;
revoke execute on function public.current_customer_id() from public, anon;
grant execute on function public.current_customer_id() to authenticated;

-- 2) Regeln für Chat/Fotos und Storage ------------------------------------
drop policy if exists "customer media own or admin read" on public.customer_media;
create policy "customer media own or admin read" on public.customer_media for select
  using (public.is_admin() or customer_id = public.current_customer_id());

drop policy if exists "customer media own or admin insert" on public.customer_media;
create policy "customer media own or admin insert" on public.customer_media for insert
  with check (
    (public.is_admin() and sender = 'admin')
    or (sender = 'customer' and category = 'chat' and customer_id = public.current_customer_id())
  );

drop policy if exists "customer photos own or admin read" on storage.objects;
create policy "customer photos own or admin read" on storage.objects for select
  using (bucket_id = 'customer-photos' and (public.is_admin() or (storage.foldername(name))[1] = public.current_customer_id()::text));

drop policy if exists "customer photos own or admin insert" on storage.objects;
create policy "customer photos own or admin insert" on storage.objects for insert
  with check (bucket_id = 'customer-photos' and (public.is_admin() or (storage.foldername(name))[1] = public.current_customer_id()::text));

-- 3) Termine: direkte Tabelle nur eigene Online-Buchungen (wie bisher
--    faktisch), Historie inkl. Kartei-Terminen über my_appointments().
drop policy if exists "appointments own or admin read" on public.appointments;
create policy "appointments own or admin read" on public.appointments for select
  using (customer_id = auth.uid() or public.is_admin());

create or replace function public.my_appointments()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status public.appointment_status,
               service_name text, service_slug text, can_cancel boolean)
language sql
stable
security definer set search_path = public
as $$
  select a.id, a.starts_at, a.ends_at, a.status, s.name, s.slug,
    a.status = 'booked' and a.starts_at >= now() + make_interval(hours => (select cancellation_hours from public.business_settings where id = true))
  from public.appointments a
  left join public.services s on s.id = a.service_id
  where auth.uid() is not null and not a.is_private
    and (a.customer_id = auth.uid() or (a.customer_ref_id is not null and a.customer_ref_id = public.current_customer_id()))
  order by a.starts_at desc;
$$;
revoke execute on function public.my_appointments() from public, anon;
grant execute on function public.my_appointments() to authenticated;

-- Stornieren auch für Termine, die Liliane für die Kundin erfasst hat.
create or replace function public.cancel_own_appointment(appointment_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  a public.appointments;
  cancellation_limit integer;
  own_customer uuid := public.current_customer_id();
begin
  select * into a from public.appointments ap
  where ap.id = appointment_id and not ap.is_private
    and (ap.customer_id = auth.uid() or (own_customer is not null and ap.customer_ref_id = own_customer))
  for update;
  if a.id is null then raise exception 'Termin nicht gefunden.'; end if;
  if a.status <> 'booked' then raise exception 'Dieser Termin kann nicht mehr storniert werden.'; end if;
  select cancellation_hours into cancellation_limit from public.business_settings where id = true;
  if a.starts_at < now() + make_interval(hours => cancellation_limit) then
    raise exception 'Online-Stornierungen sind nur bis % Stunden vor dem Termin möglich. Bitte GiGi Beauty direkt kontaktieren.', cancellation_limit;
  end if;
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = a.id;
end;
$$;

-- 4) Verknüpfung Konto -> Kartei -------------------------------------------
create or replace function public.link_profile_to_customer(target_profile_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles;
  linked_id uuid;
  candidates text;
begin
  select * into p from public.profiles where id = target_profile_id;
  if p.id is null or p.role <> 'customer' then return null; end if;
  if not exists(select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null) then return null; end if;

  select id into linked_id from public.customers where profile_id = p.id;
  if linked_id is not null then return linked_id; end if;

  -- Bestätigte E-Mail = eindeutige Zuordnung zu einem noch freien Profil.
  select id into linked_id from public.customers
  where profile_id is null and email is not null and lower(email) = lower(p.email)
  limit 1;

  if linked_id is not null then
    update public.customers set
      profile_id = p.id,
      phone = coalesce(phone, nullif(btrim(p.phone), '')),
      marketing_consent = marketing_consent or p.marketing_consent,
      marketing_consent_at = case when p.marketing_consent then coalesce(marketing_consent_at, now()) else marketing_consent_at end,
      marketing_consent_source = case when p.marketing_consent then coalesce(marketing_consent_source, 'Website Registrierung') else marketing_consent_source end,
      marketing_consent_version = case when p.marketing_consent then coalesce(marketing_consent_version, '2026-08') else marketing_consent_version end,
      acquisition_source = coalesce(acquisition_source, 'Website'),
      registered_at = coalesce(registered_at, now())
    where id = linked_id;
  else
    insert into public.customers(profile_id, full_name, email, phone, marketing_consent, marketing_consent_at,
      marketing_consent_source, marketing_consent_version, acquisition_source, registered_at)
    values (p.id, p.full_name,
      case when exists(select 1 from public.customers where lower(email) = lower(p.email)) then null else lower(p.email) end,
      nullif(btrim(p.phone), ''), p.marketing_consent,
      case when p.marketing_consent then now() end,
      case when p.marketing_consent then 'Website Registrierung' end,
      case when p.marketing_consent then '2026-08' end,
      'Website', now())
    returning id into linked_id;

    -- Mögliche Doppelprofile (gleiche Telefonnummer oder gleicher Name) nur
    -- melden, nie automatisch verknüpfen.
    select string_agg(c.full_name || coalesce(' (' || c.phone || ')', ''), ', ') into candidates
    from public.customers c
    where c.id <> linked_id and c.profile_id is null
      and ((public.normalized_phone(p.phone) is not null and public.normalized_phone(c.phone) = public.normalized_phone(p.phone))
        or lower(btrim(c.full_name)) = lower(btrim(p.full_name)));
    if candidates is not null then
      insert into public.crm_tasks(customer_id, task_type, title, description, priority, status, due_at, dedupe_key)
      values (linked_id, 'duplicate_check', 'Doppelprofil prüfen: ' || p.full_name,
        'Neues Online-Konto, passt evtl. zu bestehender Kartei: ' || candidates || '. Im Profil unter «Mögliche Doppelprofile» zusammenführen, falls es dieselbe Person ist.',
        'high', 'open', now(), 'duplicate_check:' || linked_id)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  update public.crm_tasks set status = 'done', completed_at = now(),
    description = 'Kundenkonto wurde erfolgreich mit dem CRM-Profil verknüpft.'
  where customer_id = linked_id and task_type in ('registration_invite', 'missing_email') and status = 'open';

  return linked_id;
end;
$$;
revoke execute on function public.link_profile_to_customer(uuid) from public, anon, authenticated;

-- Profil-Trigger: verknüpfte Kartei pflegen (nur leere Felder ergänzen,
-- Newsletter-Entscheid 1:1 übernehmen); unverknüpft -> verknüpfen, sobald
-- die E-Mail bestätigt ist.
create or replace function public.sync_profile_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare linked_id uuid;
begin
  if new.role <> 'customer' then return new; end if;
  select id into linked_id from public.customers where profile_id = new.id;
  if linked_id is null then
    perform public.link_profile_to_customer(new.id);
    return new;
  end if;
  update public.customers c set
    email = coalesce(c.email, case when not exists(select 1 from public.customers o where o.id <> c.id and lower(o.email) = lower(new.email)) then lower(new.email) end),
    phone = coalesce(c.phone, nullif(btrim(new.phone), '')),
    marketing_consent = case when tg_op = 'UPDATE' and old.marketing_consent is distinct from new.marketing_consent then new.marketing_consent else c.marketing_consent end,
    marketing_consent_at = case when tg_op = 'UPDATE' and old.marketing_consent is distinct from new.marketing_consent and new.marketing_consent then now() else c.marketing_consent_at end,
    marketing_consent_source = case when tg_op = 'UPDATE' and old.marketing_consent is distinct from new.marketing_consent then (case when new.marketing_consent then 'Kundenkonto' else c.marketing_consent_source end) else c.marketing_consent_source end
  where c.id = linked_id;
  return new;
end;
$$;

-- Bestätigung der E-Mail -> jetzt verknüpfen.
create or replace function public.link_customer_on_email_confirm()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.link_profile_to_customer(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
for each row execute function public.link_customer_on_email_confirm();

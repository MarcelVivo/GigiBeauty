-- Go-Live-Härtung (Bericht «Hoch», 2026-11-01)
--  1) Nichterscheinen: nur Rechnungsentwurf, Versand per Knopf (send_invoice)
--  2) Dashboard-Termine: Kundinnen-Mails nur, wenn gewünscht (notify_customer)
--     und nie für vergangene Termine
--  4/5) Online-Buchung: Mindestvorlauf, maximaler Vorlauf, max. offene Termine,
--     Positionen ohne Preis («demnächst») nicht buchbar
--  6) Newsletter: Double-Opt-in, «Nicht kontaktieren» wird nur nach
--     bestätigter Anmeldung aufgehoben

-- Buchungsregeln (Werte im Dashboard/SQL änderbar)
alter table public.business_settings
  add column if not exists min_lead_hours integer not null default 2 check (min_lead_hours >= 0),
  add column if not exists max_advance_days integer not null default 90 check (max_advance_days >= 1),
  add column if not exists max_open_bookings integer not null default 3 check (max_open_bookings >= 1);

alter table public.appointments add column if not exists notify_customer boolean not null default true;

-- 4/5) book_appointment mit Vorlauf- und Mengenregeln -------------------------
create or replace function public.book_appointment(requested_service_id uuid, requested_start timestamptz, requested_phone text default null, requested_notes text default null, requested_price_item_id uuid default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles;
  s public.services;
  pi public.service_price_items;
  settings public.business_settings;
  treatment_minutes integer;
  requested_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  weekday text;
  hours jsonb;
  new_id uuid;
  open_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Profil nicht gefunden.'; end if;
  select * into s from public.services where id = requested_service_id and active;
  if s.id is null then raise exception 'Behandlung nicht verfügbar.'; end if;

  treatment_minutes := s.duration_minutes;
  if requested_price_item_id is not null then
    select * into pi from public.service_price_items
      where id = requested_price_item_id and service_id = s.id and active;
    if pi.id is null then raise exception 'Ausgewählte Position nicht verfügbar.'; end if;
    if pi.price_chf is null then raise exception 'Diese Position ist noch nicht online buchbar.'; end if;
    treatment_minutes := coalesce(pi.duration_minutes, s.duration_minutes);
  end if;

  requested_end := requested_start + make_interval(mins => treatment_minutes);

  select * into settings from public.business_settings where id = true;
  if requested_start <= now() then raise exception 'Der Termin muss in der Zukunft liegen.'; end if;
  if requested_start < now() + make_interval(hours => settings.min_lead_hours) then
    raise exception 'Online-Buchungen sind bis % Stunden vor Beginn möglich. Für kurzfristige Termine bitte GiGi Beauty direkt kontaktieren.', settings.min_lead_hours;
  end if;
  if requested_start > now() + make_interval(days => settings.max_advance_days) then
    raise exception 'Termine können höchstens % Tage im Voraus gebucht werden.', settings.max_advance_days;
  end if;

  local_start := requested_start at time zone settings.timezone;
  local_end := requested_end at time zone settings.timezone;
  weekday := extract(isodow from local_start)::integer::text;
  hours := settings.opening_hours -> weekday;
  if hours is null
     or local_start::date <> local_end::date
     or local_start::time < (hours ->> 0)::time
     or local_end::time > (hours ->> 1)::time
     or mod(extract(epoch from (local_start::time - (hours ->> 0)::time))::integer, settings.slot_minutes * 60) <> 0
  then
    raise exception 'Dieser Termin liegt ausserhalb der Buchungszeiten.';
  end if;

  perform pg_advisory_xact_lock(hashtext('booking:' || p.id::text));
  select count(*) into open_count from public.appointments
  where customer_id = p.id and status = 'booked' and starts_at > now();
  if open_count >= settings.max_open_bookings then
    raise exception 'Du hast bereits % offene Termine. Weitere Termine bitte direkt mit GiGi Beauty vereinbaren.', open_count;
  end if;

  perform pg_advisory_xact_lock(hashtext(requested_start::text));
  if exists (
    select 1 from public.appointments
    where status = 'booked' and tstzrange(starts_at, ends_at, '[)') && tstzrange(requested_start, requested_end, '[)')
  ) or exists (
    select 1 from public.blocked_times
    where tstzrange(starts_at, ends_at, '[)') && tstzrange(requested_start, requested_end, '[)')
  ) then
    raise exception 'Dieser Termin ist bereits vergeben.';
  end if;

  insert into public.appointments (
    customer_id, service_id, price_item_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, created_by, notes, notify_customer
  ) values (
    p.id, s.id, requested_price_item_id, p.full_name, p.email, coalesce(nullif(trim(requested_phone), ''), p.phone),
    requested_start, requested_end, p.id, nullif(trim(requested_notes), ''), true
  ) returning id into new_id;
  return new_id;
end;
$$;

-- 2) Kundinnen-Mails zu Terminen nur mit notify_customer, nie rückwirkend ----
create or replace function public.queue_appointment_emails()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  service_name text;
  reminder_hours integer;
  notify boolean := coalesce(new.notify_customer, true);
begin
  select name into service_name from public.services where id = new.service_id;
  select bs.reminder_hours into reminder_hours from public.business_settings bs where id = true;

  if tg_op = 'INSERT' and not new.is_private and new.customer_email is not null and notify
     and new.status = 'booked' and new.starts_at > now() then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('confirmation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty ist bestätigt',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at, 'ends_at', new.ends_at));
    if new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    if new.customer_email is not null and notify and new.starts_at > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
      values ('cancellation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty wurde storniert',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
    end if;
  elsif tg_op = 'UPDATE' and old.starts_at is distinct from new.starts_at and new.status = 'booked' then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    if new.customer_email is not null and notify and new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  end if;
  return new;
end;
$$;

-- Eigene Stornierung der Kundin bestätigt immer per Mail.
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
  update public.appointments set status = 'cancelled', cancelled_at = now(), notify_customer = true where id = a.id;
end;
$$;

-- 1) Nichterscheinen: Entwurf statt Sofortversand ----------------------------
create or replace function public.create_no_show_invoice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'no_show' and old.status is distinct from new.status and not new.is_private then
    insert into public.invoices (appointment_id, customer_id, customer_name, customer_email, amount_chf, reason, status)
    values (new.id, new.customer_id, new.customer_name, new.customer_email, coalesce(new.amount_chf, 0),
      'Nichterscheinen ohne rechtzeitige Abmeldung (mindestens 24 Stunden vorher)', 'draft')
    on conflict (appointment_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.send_invoice(requested_invoice_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
  appointment_row public.appointments;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into inv from public.invoices where id = requested_invoice_id for update;
  if inv.id is null then raise exception 'Rechnung nicht gefunden.'; end if;
  if inv.customer_email is null then raise exception 'Für diese Rechnung fehlt eine E-Mail-Adresse.'; end if;
  if inv.status in ('paid', 'void') then raise exception 'Diese Rechnung ist bereits bezahlt oder storniert.'; end if;
  if exists (select 1 from public.email_outbox where kind = 'invoice' and payload ->> 'invoice_id' = inv.id::text and processed_at is null) then
    raise exception 'Diese Rechnung wird bereits versendet.';
  end if;
  select * into appointment_row from public.appointments where id = inv.appointment_id;
  update public.invoices set due_at = greatest(due_at, current_date + 7) where id = inv.id returning * into inv;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
  values ('invoice', inv.customer_email, inv.customer_name, 'Rechnung von GiGi Beauty',
    jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'appointment_id', inv.appointment_id,
      'starts_at', appointment_row.starts_at, 'amount_chf', inv.amount_chf, 'due_at', inv.due_at));
end;
$$;
revoke execute on function public.send_invoice(uuid) from public, anon;
grant execute on function public.send_invoice(uuid) to authenticated;

-- 6) Newsletter Double-Opt-in --------------------------------------------------
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite','newsletter_welcome','ai_preview_followup',
  'owner_notice','newsletter_confirm'
));

drop function if exists public.subscribe_newsletter(text, text);
create or replace function public.subscribe_newsletter(requested_email text, requested_name text default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(requested_email, '')));
  display_name text;
begin
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.';
  end if;
  if exists (select 1 from public.customers where email = normalized_email and marketing_consent and not do_not_contact) then
    return 'already';
  end if;
  -- Höchstens eine Bestätigungsmail pro Adresse und Tag (Missbrauchsschutz).
  if exists (select 1 from public.email_outbox where kind = 'newsletter_confirm' and recipient_email = normalized_email and created_at > now() - interval '1 day') then
    return 'pending';
  end if;
  display_name := coalesce(nullif(trim(requested_name), ''), split_part(normalized_email, '@', 1));
  insert into public.email_outbox (kind, recipient_email, recipient_name, subject, payload)
  values ('newsletter_confirm', normalized_email, display_name, 'Bitte bestätige deine Anmeldung',
    jsonb_build_object('content', 'Du hast dich für Neuigkeiten von GiGi Beauty angemeldet. Bitte bestätige deine Anmeldung, damit wir dir schreiben dürfen. Falls du das nicht warst, ignoriere diese E-Mail einfach.'));
  return 'confirm_sent';
end;
$$;
revoke execute on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

-- Aufgerufen von der Edge Function track-marketing (Service-Rolle), nachdem
-- die Empfängerin auf «Anmeldung bestätigen» geklickt hat.
create or replace function public.confirm_newsletter_subscription(confirm_outbox_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  o public.email_outbox;
begin
  select * into o from public.email_outbox where id = confirm_outbox_id and kind = 'newsletter_confirm';
  if o.id is null or o.created_at < now() - interval '30 days' then return false; end if;
  insert into public.customers (full_name, email, source, acquisition_source, marketing_consent, marketing_consent_at, marketing_consent_source)
  values (coalesce(o.recipient_name, split_part(o.recipient_email, '@', 1)), o.recipient_email, 'Website', 'Newsletter', true, now(), 'Newsletter Double-Opt-in')
  on conflict (email) do update set
    marketing_consent = true,
    marketing_consent_at = now(),
    marketing_consent_source = 'Newsletter Double-Opt-in',
    do_not_contact = false;
  if not exists (select 1 from public.email_outbox where kind = 'newsletter_welcome' and recipient_email = o.recipient_email) then
    insert into public.email_outbox (kind, recipient_email, recipient_name, subject, payload)
    values ('newsletter_welcome', o.recipient_email, o.recipient_name, 'Willkommen bei GiGi Beauty',
      jsonb_build_object('content', 'Schön, dass du dabei bist! Ab jetzt hörst du bei GiGi Beauty zuerst von Neuigkeiten, Aktionen und freien Terminen. Du kannst dich jederzeit über den Abmeldelink in einer unserer E-Mails wieder austragen.'));
  end if;
  return true;
end;
$$;
revoke execute on function public.confirm_newsletter_subscription(uuid) from public, anon, authenticated;

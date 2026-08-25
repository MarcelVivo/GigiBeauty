-- Termine lassen sich im Dashboard jetzt per Drag & Drop auf Tag+Uhrzeit
-- verschieben (assets/js/dashboard.js). Danach entscheidet die Admin über
-- ein Flyout-Menü pro Vorgang, ob die Kundin eine automatische
-- Verschiebungs-Bestätigung erhält -- statt wie bisher IMMER automatisch,
-- sobald sich starts_at ändert (queue_appointment_emails() in
-- 202608070001_booking_crm.sql).
--
-- 1) Trigger: das automatische Einreihen der 'rescheduled'-Mail entfällt.
--    Die Erinnerungsmail (kind='reminder') muss weiterhin bei jeder
--    Zeitänderung neu eingeplant werden -- das ist eine betriebliche
--    Notwendigkeit (sonst feuert sie zur falschen/vergangenen Zeit) und
--    bleibt unverändert automatisch, unabhängig von der Mail-Entscheidung.
create or replace function public.queue_appointment_emails()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  service_name text;
  reminder_hours integer;
begin
  select name into service_name from public.services where id = new.service_id;
  select bs.reminder_hours into reminder_hours from public.business_settings bs where id = true;

  if tg_op = 'INSERT' and not new.is_private and new.customer_email is not null then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('confirmation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty ist bestätigt',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
    if new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' and new.customer_email is not null then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('cancellation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty wurde storniert',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
  elsif tg_op = 'UPDATE' and old.starts_at is distinct from new.starts_at and new.status = 'booked' and new.customer_email is not null then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    if new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  end if;
  return new;
end;
$$;

-- 2) Neue RPC: von der Admin manuell ausgelöst (Flyout "Bestätigungsmail
--    senden" nach einem Drag & Drop oder einer manuellen Zeitänderung).
--    Nutzt denselben email_outbox-Eintrag/dieselbe Vorlage (kind =
--    'rescheduled'), die process-booking-emails/index.ts bereits kennt --
--    dort war dieser Zweig bislang unbenutzt, keine Edge-Function-Änderung
--    nötig.
create or replace function public.queue_reschedule_email(requested_appointment_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  appointment_row public.appointments;
  service_name text;
  outbox_id uuid;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into appointment_row from public.appointments where id = requested_appointment_id;
  if appointment_row.id is null then raise exception 'Termin nicht gefunden.'; end if;
  if appointment_row.customer_email is null then raise exception 'Für diesen Termin fehlt eine E-Mail-Adresse.'; end if;
  select name into service_name from public.services where id = appointment_row.service_id;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
  values ('rescheduled', appointment_row.customer_email, appointment_row.customer_name, 'Dein Termin bei GiGi Beauty wurde verschoben',
    jsonb_build_object('appointment_id', appointment_row.id, 'service', service_name, 'starts_at', appointment_row.starts_at))
  returning id into outbox_id;
  return outbox_id;
end;
$$;

grant execute on function public.queue_reschedule_email(uuid) to authenticated;

-- Terminerinnerung 24 Stunden vorher (statt 4) und auch für Termine ohne
-- E-Mail am Termin selbst: dann gilt die Adresse aus der Kundenkartei
-- (customer_ref_id), ausser die Kundin ist auf «nicht kontaktieren» gesetzt.
-- Bestätigungen/Stornos/Verschiebungen bleiben unverändert (nur mit
-- customer_email am Termin bzw. «Kundin benachrichtigen»).

update public.business_settings set reminder_hours = 24 where id = true;
alter table public.business_settings alter column reminder_hours set default 24;

create or replace function public.appointment_reminder_email(a public.appointments)
returns text
language sql stable
security definer set search_path = public
as $$
  select coalesce(
    nullif(trim(a.customer_email), ''),
    (select nullif(trim(c.email), '') from public.customers c
     where c.id = a.customer_ref_id and not coalesce(c.do_not_contact, false))
  );
$$;

create or replace function public.queue_appointment_reminder(a public.appointments)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  reminder_hours integer;
  recipient text := public.appointment_reminder_email(a);
  service_name text;
begin
  if a.is_private or a.status <> 'booked' or recipient is null or a.starts_at <= now() then return; end if;
  if exists (select 1 from public.email_outbox where kind = 'reminder' and processed_at is null and payload ->> 'appointment_id' = a.id::text) then return; end if;
  select bs.reminder_hours into reminder_hours from public.business_settings bs where id = true;
  select name into service_name from public.services where id = a.service_id;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
  values ('reminder', recipient,
    coalesce(a.customer_name, (select full_name from public.customers where id = a.customer_ref_id)),
    'Erinnerung: Dein Termin bei GiGi Beauty',
    jsonb_build_object('appointment_id', a.id, 'service', service_name, 'starts_at', a.starts_at),
    -- Liegt der Termin schon innerhalb der Frist, geht die Erinnerung sofort raus.
    greatest(a.starts_at - make_interval(hours => reminder_hours), now()));
end;
$$;

create or replace function public.queue_appointment_emails()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  service_name text;
  notify boolean := coalesce(new.notify_customer, true);
begin
  select name into service_name from public.services where id = new.service_id;

  if tg_op = 'INSERT' and not new.is_private and new.customer_email is not null and notify
     and new.status = 'booked' and new.starts_at > now() then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('confirmation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty ist bestätigt',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at, 'ends_at', new.ends_at));
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    if new.customer_email is not null and notify and new.starts_at > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
      values ('cancellation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty wurde storniert',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'booked' and (old.starts_at is distinct from new.starts_at or old.status <> 'booked') then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
  end if;

  -- Erinnerung für jeden kommenden gebuchten Termin (neu, verschoben, reaktiviert).
  if new.status = 'booked' and (tg_op = 'INSERT' or old.starts_at is distinct from new.starts_at or old.status <> 'booked') then
    perform public.queue_appointment_reminder(new);
  end if;
  return new;
end;
$$;

-- Bestehende kommende Termine nachträglich einplanen; Termine innerhalb der
-- nächsten 24 Stunden erhalten die Erinnerung sofort.
select public.queue_appointment_reminder(a) from public.appointments a
where a.status = 'booked' and not a.is_private and a.starts_at > now();

-- Info-Mail (und Push) an Liliane nur noch, wenn eine Kundin selbst bucht,
-- storniert oder verschiebt. Änderungen im Dashboard (is_admin()) lösen
-- keine owner_notice mehr aus. Kundinnen-Mails bleiben unverändert.

create or replace function public.queue_owner_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  owner_email text;
  service_name text;
  event text;
  subject_prefix text;
begin
  if new.is_private then return new; end if;
  -- Änderungen, die Liliane im Dashboard selbst macht, kennt sie schon.
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' and new.status = 'booked' then
    event := 'booked'; subject_prefix := 'Neue Buchung';
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' then
    event := 'cancelled'; subject_prefix := 'Storniert';
  elsif tg_op = 'UPDATE' and new.status = 'booked'
    and ((old.starts_at is distinct from new.starts_at) <> (old.ends_at is distinct from new.ends_at)) then
    -- genau ein Rand geändert = verlängert/verkürzt
    event := 'duration'; subject_prefix := 'Dauer geändert';
  elsif tg_op = 'UPDATE' and new.status = 'booked' and old.starts_at is distinct from new.starts_at then
    event := 'rescheduled'; subject_prefix := 'Verschoben';
  else
    return new;
  end if;

  select bs.admin_email into owner_email from public.business_settings bs where id = true;
  if owner_email is null or btrim(owner_email) = '' then return new; end if;
  select name into service_name from public.services where id = new.service_id;

  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
  values ('owner_notice', owner_email, 'Liliane',
    subject_prefix || ': ' || new.customer_name || ' · '
      || to_char(new.starts_at at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI'),
    jsonb_build_object(
      'event', event,
      'appointment_id', new.id,
      'service', service_name,
      'starts_at', new.starts_at,
      'ends_at', new.ends_at,
      'old_starts_at', case when event in ('rescheduled', 'duration') then old.starts_at end,
      'old_ends_at', case when event in ('rescheduled', 'duration') then old.ends_at end,
      'customer_name', new.customer_name,
      'customer_email', new.customer_email,
      'customer_phone', new.customer_phone,
      'notes', new.notes,
      'source', 'online'
    ));
  return new;
end;
$$;

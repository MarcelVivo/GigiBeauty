-- Termine lassen sich im Dashboard jetzt am oberen/unteren Rand im
-- 15-Minuten-Raster verlängern/verkürzen (assets/js/dashboard.js
-- attachCalendarResizeHandlers). Nach der Bestätigung erhalten Kundin und
-- Inhaberin eine Info-Mail.
--
-- 1) Inhaberin: queue_owner_notification() meldet Änderungen, bei denen
--    genau ein Rand (Start oder Ende) verschoben wurde, als
--    event = 'duration' statt 'rescheduled'.
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
      'source', case when public.is_admin() then 'dashboard' else 'online' end
    ));
  return new;
end;
$$;

-- 2) Kundin: queue_reschedule_email() bekommt einen optionalen Parameter
--    change ('moved' | 'duration') und gibt ends_at mit, damit die Mail die
--    neue Endzeit zeigt. Alte 1-Parameter-Version entfernen, sonst ist der
--    RPC-Aufruf mit nur requested_appointment_id mehrdeutig.
drop function if exists public.queue_reschedule_email(uuid);
create or replace function public.queue_reschedule_email(requested_appointment_id uuid, change text default 'moved')
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
  values ('rescheduled', appointment_row.customer_email, appointment_row.customer_name,
    case when change = 'duration' then 'Dein Termin bei GiGi Beauty wurde angepasst' else 'Dein Termin bei GiGi Beauty wurde verschoben' end,
    jsonb_build_object('appointment_id', appointment_row.id, 'service', service_name, 'starts_at', appointment_row.starts_at,
      'ends_at', appointment_row.ends_at, 'change', case when change = 'duration' then 'duration' else 'moved' end))
  returning id into outbox_id;
  return outbox_id;
end;
$$;

grant execute on function public.queue_reschedule_email(uuid, text) to authenticated;

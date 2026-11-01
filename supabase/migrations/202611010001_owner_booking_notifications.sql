-- Interne Info-Mail an die Inhaberin bei jeder Buchung, Stornierung und
-- Verschiebung -- egal ob online durch die Kundin oder im Dashboard.
-- Empfängerin ist business_settings.admin_email (laut Kommentar in
-- 202608240006_editable_business_contact.sql genau dafür gedacht).
--
-- Eigener Trigger statt Erweiterung von queue_appointment_emails(), damit die
-- Kundinnen-Mails unverändert bleiben. Versand über die bestehende
-- email_outbox + process-booking-emails (kind = 'owner_notice').

update public.business_settings set admin_email = 'l.serrano@gmx.ch' where id = true;

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite','newsletter_welcome','ai_preview_followup',
  'owner_notice'
));

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
      'old_starts_at', case when event = 'rescheduled' then old.starts_at end,
      'customer_name', new.customer_name,
      'customer_email', new.customer_email,
      'customer_phone', new.customer_phone,
      'notes', new.notes,
      'source', case when public.is_admin() then 'dashboard' else 'online' end
    ));
  return new;
end;
$$;

drop trigger if exists appointment_owner_notification on public.appointments;
create trigger appointment_owner_notification after insert or update on public.appointments
for each row execute function public.queue_owner_notification();

-- Interne Mails gehören nicht in die Kommunikations-Historie einer Kundin.
create or replace function public.log_outbox_communication()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_customer uuid;
begin
  if new.kind = 'owner_notice' then return new; end if;
  select id into target_customer from public.customers where lower(email) = lower(new.recipient_email) limit 1;
  insert into public.customer_communications(customer_id, email_outbox_id, channel, direction, communication_type, subject, content, status, scheduled_at, occurred_at)
  values(target_customer, new.id, 'email', 'outbound', new.kind, new.subject, new.payload ->> 'content', 'planned', new.scheduled_for, new.created_at)
  on conflict (email_outbox_id) do nothing;
  return new;
end;
$$;

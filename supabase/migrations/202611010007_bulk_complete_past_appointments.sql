-- Vergangene, noch "gebuchte" Termine gesammelt abschliessen (Dashboard,
-- Übersicht -> "Status nachtragen"). Live standen am 2026-11-01 alle 213
-- vergangenen Termine noch auf 'booked' -> Umsatz, Finanzen und Diagramme
-- zeigten 0.
--
-- Beim Nachtragen dürfen keine Kundinnen-Mails (Nachsorge, Bewertung,
-- Wiederbuchung) und kein Lagerabzug für längst vergangene Behandlungen
-- entstehen. Beide Trigger prüfen dafür das Transaktions-Flag
-- gigi.bulk_complete. track_completed_booking_value() läuft weiter
-- (Umsatz-Zuordnung im Marketing ist erwünscht).

create or replace function public.queue_customer_journey()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_customer public.customers;
  service_row public.services;
  booking_url text := 'https://www.gigibeauty.ch/pages/booking.html';
  aftercare_rule public.automation_rules;
  review_rule public.automation_rules;
  rebooking_rule public.automation_rules;
begin
  if current_setting('gigi.bulk_complete', true) = 'on' then return new; end if;
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.is_private or new.customer_email is null then return new; end if;
  select * into target_customer from public.customers where lower(email) = lower(new.customer_email) limit 1;
  select * into service_row from public.services where id = new.service_id;

  select * into aftercare_rule from public.automation_rules where rule_key = 'aftercare';
  select * into review_rule from public.automation_rules where rule_key = 'review';
  select * into rebooking_rule from public.automation_rules where rule_key = 'rebooking';

  if coalesce(aftercare_rule.active, true) and not exists(select 1 from public.email_outbox where kind = 'aftercare' and payload ->> 'appointment_id' = new.id::text) then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
    values('aftercare', new.customer_email, new.customer_name,
      coalesce(nullif(trim(aftercare_rule.subject_template), ''), 'Deine Pflege nach ' || coalesce(service_row.name, 'deiner Behandlung')),
      jsonb_build_object('appointment_id', new.id, 'service', service_row.name,
        'content', coalesce(nullif(trim(aftercare_rule.content_template), ''), 'Danke für deinen Besuch. Beachte bitte die persönlich besprochenen Pflegehinweise. Bei Fragen sind wir gerne für dich da.')),
      now() + interval '2 hours');
  end if;

  if coalesce(target_customer.marketing_consent, false) and not target_customer.do_not_contact then
    if coalesce(review_rule.active, true) and not exists(select 1 from public.email_outbox where kind = 'review' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('review', new.customer_email, new.customer_name,
        coalesce(nullif(trim(review_rule.subject_template), ''), 'Wie zufrieden warst du bei GiGi Beauty?'),
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name,
          'content', coalesce(nullif(trim(review_rule.content_template), ''), 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Google-Bewertung.')),
        now() + interval '48 hours');
    end if;
    if coalesce(rebooking_rule.active, true) and not exists(select 1 from public.email_outbox where kind = 'rebooking' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('rebooking', new.customer_email, new.customer_name,
        coalesce(nullif(trim(rebooking_rule.subject_template), ''), 'Zeit für deinen nächsten GiGi Beauty Termin'),
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'booking_url', booking_url,
          'content', coalesce(nullif(trim(rebooking_rule.content_template), ''), 'Dein übliches Wiederbuchungsfenster ist erreicht. Sichere dir jetzt deinen Wunschtermin.')),
        greatest(now() + interval '24 hours', new.starts_at + make_interval(days => coalesce(service_row.rebooking_days, 28))));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.consume_inventory_for_appointment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if current_setting('gigi.bulk_complete', true) = 'on' then return new; end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and new.service_id is not null then
    insert into public.inventory_movements(inventory_item_id, appointment_id, movement_type, quantity_delta, notes)
    select si.inventory_item_id, new.id, 'consumption', -si.quantity_used, 'Automatischer Verbrauch: ' || new.customer_name
    from public.service_inventory si where si.service_id = new.service_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Nur Termine, die vollständig vorbei sind (ends_at <= now()), noch auf
-- 'booked' stehen und keine privaten Einträge sind. appointment_ids = null
-- -> alle solchen Termine, sonst nur die übergebenen.
create or replace function public.complete_past_appointments(appointment_ids uuid[] default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare affected integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  perform set_config('gigi.bulk_complete', 'on', true);
  update public.appointments set status = 'completed'
  where status = 'booked' and not is_private and ends_at <= now()
    and (appointment_ids is null or id = any(appointment_ids));
  get diagnostics affected = row_count;
  perform set_config('gigi.bulk_complete', 'off', true);
  return affected;
end;
$$;

revoke execute on function public.complete_past_appointments(uuid[]) from public, anon;
grant execute on function public.complete_past_appointments(uuid[]) to authenticated;

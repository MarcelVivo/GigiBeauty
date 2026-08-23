-- Die automatischen Nachpflege-/Bewertungs-/Wiederbuchungs-Mails ignorierten
-- bisher den An/Aus-Schalter der jeweiligen Regel in automation_rules
-- komplett -- der Schalter im Dashboard hatte für diese drei keine Wirkung.
-- Diese Version prüft vor jedem Einplanen, ob die Regel aktiv ist.

create or replace function public.queue_customer_journey()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_customer public.customers;
  service_row public.services;
  booking_url text := 'https://www.gigibeauty.ch/pages/booking.html';
  aftercare_active boolean;
  review_active boolean;
  rebooking_active boolean;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.is_private or new.customer_email is null then return new; end if;
  select * into target_customer from public.customers where lower(email) = lower(new.customer_email) limit 1;
  select * into service_row from public.services where id = new.service_id;

  select active into aftercare_active from public.automation_rules where rule_key = 'aftercare';
  select active into review_active from public.automation_rules where rule_key = 'review';
  select active into rebooking_active from public.automation_rules where rule_key = 'rebooking';

  if coalesce(aftercare_active, true) and not exists(select 1 from public.email_outbox where kind = 'aftercare' and payload ->> 'appointment_id' = new.id::text) then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
    values('aftercare', new.customer_email, new.customer_name, 'Deine Pflege nach ' || coalesce(service_row.name, 'deiner Behandlung'),
      jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'content', 'Danke für deinen Besuch. Beachte bitte die persönlich besprochenen Pflegehinweise. Bei Fragen sind wir gerne für dich da.'), now() + interval '2 hours');
  end if;

  if coalesce(target_customer.marketing_consent, false) and not target_customer.do_not_contact then
    if coalesce(review_active, true) and not exists(select 1 from public.email_outbox where kind = 'review' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('review', new.customer_email, new.customer_name, 'Wie zufrieden warst du bei GiGi Beauty?',
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'content', 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Google-Bewertung.'), now() + interval '48 hours');
    end if;
    if coalesce(rebooking_active, true) and not exists(select 1 from public.email_outbox where kind = 'rebooking' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('rebooking', new.customer_email, new.customer_name, 'Zeit für deinen nächsten GiGi Beauty Termin',
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'booking_url', booking_url, 'content', 'Dein übliches Wiederbuchungsfenster ist erreicht. Sichere dir jetzt deinen Wunschtermin.'),
        greatest(now() + interval '24 hours', new.starts_at + make_interval(days => coalesce(service_row.rebooking_days, 28))));
    end if;
  end if;
  return new;
end;
$$;

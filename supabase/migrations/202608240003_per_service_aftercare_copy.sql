-- Pflegehinweise unterscheiden sich stark je Behandlung (Nägel, Wimpern,
-- Permanent Make-up, ...). Ein einziger allgemeiner Text macht daher wenig
-- Sinn. Jede Behandlungskategorie bekommt jetzt einen eigenen, im Dashboard
-- editierbaren Pflegetext; die bisherige globale Vorlage (automation_rules)
-- bleibt als Rückfallwert für Kategorien ohne eigenen Text.

alter table public.services add column if not exists aftercare_copy text;
comment on column public.services.aftercare_copy is
  'Individuelle Pflegehinweise für diese Behandlungskategorie, versendet 2 Std. nach Abschluss des Termins. NULL = allgemeiner Text aus automation_rules gilt.';

create or replace function public.queue_customer_journey()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_customer public.customers;
  service_row public.services;
  booking_url text := 'https://www.gigibeauty.ch/pages/booking.html';
  aftercare_rule public.automation_rules;
  review_rule public.automation_rules;
  rebooking_rule public.automation_rules;
  aftercare_subject text;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.is_private or new.customer_email is null then return new; end if;
  select * into target_customer from public.customers where lower(email) = lower(new.customer_email) limit 1;
  select * into service_row from public.services where id = new.service_id;

  select * into aftercare_rule from public.automation_rules where rule_key = 'aftercare';
  select * into review_rule from public.automation_rules where rule_key = 'review';
  select * into rebooking_rule from public.automation_rules where rule_key = 'rebooking';

  if coalesce(aftercare_rule.active, true) and not exists(select 1 from public.email_outbox where kind = 'aftercare' and payload ->> 'appointment_id' = new.id::text) then
    aftercare_subject := replace(
      coalesce(nullif(trim(aftercare_rule.subject_template), ''), 'Deine Pflege nach {{service}}'),
      '{{service}}', coalesce(service_row.name, 'deiner Behandlung'));
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
    values('aftercare', new.customer_email, new.customer_name, aftercare_subject,
      jsonb_build_object('appointment_id', new.id, 'service', service_row.name,
        'content', coalesce(nullif(trim(service_row.aftercare_copy), ''), nullif(trim(aftercare_rule.content_template), ''), 'Danke für deinen Besuch. Beachte bitte die persönlich besprochenen Pflegehinweise. Bei Fragen sind wir gerne für dich da.')),
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

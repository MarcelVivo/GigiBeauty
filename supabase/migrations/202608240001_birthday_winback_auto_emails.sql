-- Geburtstag & Reaktivierung erzeugten bisher nur eine interne Erinnerungs-
-- Aufgabe im Smart CRM, aber nie eine tatsächliche E-Mail an die Kundin --
-- unabhängig vom An/Aus-Schalter. Jetzt wird zusätzlich zur Aufgabe auch
-- eine E-Mail eingeplant, sofern die jeweilige Automation aktiv ist und die
-- Kundin eine gültige Marketing-Einwilligung hat.

create or replace function public.generate_daily_crm_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted_count integer := 0;
  row_count_value integer;
  birthday_rule public.automation_rules;
  winback_rule public.automation_rules;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;

  select * into birthday_rule from public.automation_rules where rule_key = 'birthday';
  select * into winback_rule from public.automation_rules where rule_key = 'winback';

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select c.id, 'registration_invite', 'Zum Kundenlogin einladen: ' || c.full_name,
    case when c.email is not null then 'Einladung per E-Mail senden.'
         when public.normalized_phone(c.phone) is not null then 'Einladung per WhatsApp oder SMS senden und E-Mail bei Gelegenheit ergänzen.'
         else 'Für eine Einladung fehlen E-Mail und gültige Telefonnummer.' end,
    case when c.email is not null or public.normalized_phone(c.phone) is not null then 'high' else 'normal' end,
    now(), 'registration-invite:' || c.id::text
  from public.customers c
  where c.profile_id is null
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select c.id, 'missing_email', 'E-Mail ergänzen: ' || c.full_name,
    case when public.normalized_phone(c.phone) is not null
      then 'Per Telefon, WhatsApp oder SMS nach der E-Mail-Adresse fragen.'
      else 'Ohne E-Mail und Telefonnummer ist keine digitale Einladung möglich.' end,
    'normal', now(), 'missing-email:' || c.id::text
  from public.customers c where c.email is null
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select null::uuid, 'low_stock', 'Lagerbestand prüfen: ' || i.name,
    'Bestand ' || i.stock_quantity || ' ' || i.unit || ', Mindestbestand ' || i.minimum_quantity || ' ' || i.unit || '.',
    'high', now(), 'low-stock:' || i.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from public.inventory_items i
  where i.active and i.stock_quantity <= i.minimum_quantity
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  with last_visit as (
    select distinct on (c.id) c.id customer_id, c.full_name, c.email,
      a.id appointment_id, a.starts_at, a.service_id, s.name service_name, s.rebooking_days
    from public.customers c join public.appointments a
      on c.email is not null and lower(a.customer_email) = lower(c.email)
    left join public.services s on s.id = a.service_id
    where a.status = 'completed'
    order by c.id, a.starts_at desc
  )
  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key, metadata)
  select l.customer_id, 'rebooking', 'Wiederbuchung: ' || l.full_name,
    coalesce(l.service_name, 'Letzte Behandlung') || ' ist wieder fällig.', 'high',
    l.starts_at + make_interval(days => coalesce(l.rebooking_days, 28)), 'rebook:' || l.appointment_id::text,
    jsonb_build_object('appointment_id', l.appointment_id, 'service_id', l.service_id)
  from last_visit l
  where l.starts_at + make_interval(days => coalesce(l.rebooking_days, 28)) <= now()
    and not exists(select 1 from public.appointments future where future.status = 'booked'
      and future.starts_at > now() and lower(future.customer_email) = lower(l.email))
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  with visits as (
    select c.id, c.full_name, c.email, c.marketing_consent, c.do_not_contact, max(a.starts_at) last_visit
    from public.customers c join public.appointments a
      on c.email is not null and lower(a.customer_email) = lower(c.email)
    where a.status = 'completed' group by c.id, c.full_name, c.email, c.marketing_consent, c.do_not_contact
  )
  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select v.id, 'winback', 'Reaktivieren: ' || v.full_name, 'Seit mehr als 180 Tagen ohne Besuch.',
    'normal', now(), 'winback:' || v.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from visits v where v.last_visit < now() - interval '180 days'
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  if winback_rule.active then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    select 'winback', v.email, v.full_name, coalesce(winback_rule.subject_template, 'Wir vermissen dich bei GiGi Beauty'),
      jsonb_build_object('customer_id', v.id, 'period', to_char(current_date, 'YYYY-MM'),
        'content', coalesce(winback_rule.content_template, 'Es ist schon eine Weile her. Wir würden uns freuen, dich wiederzusehen.'),
        'booking_url', 'https://www.gigibeauty.ch/pages/booking.html')
    from visits v
    where v.last_visit < now() - interval '180 days'
      and coalesce(v.marketing_consent, false) and not coalesce(v.do_not_contact, false)
      and not exists(select 1 from public.email_outbox eo where eo.kind = 'winback'
        and eo.payload ->> 'customer_id' = v.id::text and eo.payload ->> 'period' = to_char(current_date, 'YYYY-MM'));
    get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;
  end if;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select c.id, 'birthday', 'Geburtstag: ' || c.full_name, 'Persönliche Geburtstagsnachricht vorbereiten.', 'normal',
    make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
      extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28))::timestamptz,
    'birthday:' || c.id::text || ':' || extract(year from current_date)::text
  from public.customers c where c.birth_date is not null and
    (make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
      extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28)) - current_date) between 0 and 14
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  if birthday_rule.active then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
    select 'birthday', c.email, c.full_name, coalesce(birthday_rule.subject_template, 'Alles Liebe zum Geburtstag'),
      jsonb_build_object('customer_id', c.id, 'period', extract(year from current_date)::text,
        'content', coalesce(birthday_rule.content_template, 'Wir wünschen dir einen wunderschönen Geburtstag.')),
      make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
        extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28))::timestamptz + interval '9 hours'
    from public.customers c
    where c.birth_date is not null and c.email is not null
      and coalesce(c.marketing_consent, false) and not coalesce(c.do_not_contact, false)
      and (make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
        extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28)) - current_date) between 0 and 14
      and not exists(select 1 from public.email_outbox eo where eo.kind = 'birthday'
        and eo.payload ->> 'customer_id' = c.id::text and eo.payload ->> 'period' = extract(year from current_date)::text);
    get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;
  end if;

  return inserted_count;
end;
$$;

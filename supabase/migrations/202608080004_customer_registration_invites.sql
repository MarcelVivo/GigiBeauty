-- GiGi Beauty: bestehende CRM-Kundinnen zur Registrierung einladen und
-- beim Signup anhand einer eindeutigen Telefonnummer sicher verknüpfen.
-- Nach 202608080003_high_end_business_suite.sql ausführen.

alter table public.customers
  add column if not exists registration_invited_at timestamptz,
  add column if not exists registration_invite_channel text
    check (registration_invite_channel is null or registration_invite_channel in ('email','sms','whatsapp')),
  add column if not exists registered_at timestamptz;

update public.customers c
set registered_at = coalesce(c.registered_at, p.created_at)
from public.profiles p
where c.profile_id = p.id and c.registered_at is null;

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite'
));

create or replace function public.normalized_phone(value text)
returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g')) >= 9
      then right(regexp_replace(value, '[^0-9]', '', 'g'), 9)
    else null
  end;
$$;

create or replace function public.sync_profile_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  matching_customers uuid[];
  matched_customer_id uuid;
begin
  if new.role = 'customer' then
    -- Eine bereits bekannte E-Mail ist die stärkste eindeutige Zuordnung.
    select c.id into matched_customer_id
    from public.customers c
    where c.email is not null and lower(c.email) = lower(new.email)
    limit 1;

    -- Eine Telefonnummer wird nur automatisch verwendet, wenn genau ein
    -- unverknüpftes CRM-Profil ohne E-Mail dazu existiert. Bei Doppelprofilen
    -- erfolgt aus Sicherheitsgründen keine automatische Zuordnung.
    if matched_customer_id is null and public.normalized_phone(new.phone) is not null then
      select array_agg(c.id) into matching_customers
      from public.customers c
      where c.profile_id is null
        and c.email is null
        and public.normalized_phone(c.phone) = public.normalized_phone(new.phone);
    end if;

    if matched_customer_id is null and coalesce(cardinality(matching_customers), 0) = 1 then
      matched_customer_id := matching_customers[1];
    end if;

    if matched_customer_id is not null then
      update public.customers set
        profile_id = new.id,
        full_name = new.full_name,
        email = lower(new.email),
        phone = coalesce(nullif(trim(new.phone), ''), phone),
        marketing_consent = marketing_consent or new.marketing_consent,
        marketing_consent_at = case when new.marketing_consent then coalesce(marketing_consent_at, now()) else marketing_consent_at end,
        marketing_consent_source = case when new.marketing_consent then coalesce(marketing_consent_source, 'Website Registrierung') else marketing_consent_source end,
        marketing_consent_version = case when new.marketing_consent then coalesce(marketing_consent_version, '2026-08') else marketing_consent_version end,
        acquisition_source = coalesce(acquisition_source, 'Website'),
        registered_at = coalesce(registered_at, now())
      where id = matched_customer_id;
    else
      insert into public.customers(
        profile_id, full_name, email, phone, marketing_consent, marketing_consent_at,
        marketing_consent_source, marketing_consent_version, acquisition_source, registered_at
      ) values(
        new.id, new.full_name, lower(new.email), new.phone, new.marketing_consent,
        case when new.marketing_consent then now() else null end,
        case when new.marketing_consent then 'Website Registrierung' else null end,
        case when new.marketing_consent then '2026-08' else null end,
        'Website', now()
      )
      on conflict (email) do update set
        profile_id = excluded.profile_id,
        full_name = excluded.full_name,
        phone = coalesce(excluded.phone, customers.phone),
        marketing_consent = customers.marketing_consent or excluded.marketing_consent,
        marketing_consent_at = case when excluded.marketing_consent then coalesce(customers.marketing_consent_at, now()) else customers.marketing_consent_at end,
        marketing_consent_source = case when excluded.marketing_consent then coalesce(customers.marketing_consent_source, 'Website Registrierung') else customers.marketing_consent_source end,
        marketing_consent_version = case when excluded.marketing_consent then coalesce(customers.marketing_consent_version, '2026-08') else customers.marketing_consent_version end,
        registered_at = coalesce(customers.registered_at, now());
      select id into matched_customer_id from public.customers where lower(email) = lower(new.email) limit 1;
    end if;

    update public.crm_tasks set
      status = 'done', completed_at = now(), completed_by = new.id,
      description = 'Kundenkonto wurde erfolgreich mit dem CRM-Profil verknüpft.'
    where customer_id = matched_customer_id
      and task_type in ('registration_invite','missing_email')
      and status = 'open';
  end if;
  return new;
end;
$$;

create or replace function public.queue_registration_invite(requested_customer_id uuid, requested_channel text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  customer_row public.customers;
  invite_url text := 'https://www.gigibeauty.ch/pages/booking.html?register=1';
  invite_message text;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if requested_channel not in ('email','sms','whatsapp') then raise exception 'Ungültiger Kontaktkanal.'; end if;

  select * into customer_row from public.customers where id = requested_customer_id;
  if customer_row.id is null then raise exception 'Kundin nicht gefunden.'; end if;
  if customer_row.profile_id is not null then raise exception 'Diese Kundin besitzt bereits ein Login.'; end if;
  if customer_row.do_not_contact then raise exception 'Für diese Kundin ist keine Kontaktaufnahme erlaubt.'; end if;
  if requested_channel = 'email' and customer_row.email is null then raise exception 'E-Mail-Adresse fehlt.'; end if;
  if requested_channel in ('sms','whatsapp') and public.normalized_phone(customer_row.phone) is null then raise exception 'Gültige Telefonnummer fehlt.'; end if;

  invite_message := 'Hallo ' || split_part(customer_row.full_name, ' ', 1) || E'\n\n' ||
    'du kannst deine Termine bei GiGi Beauty neu direkt online verwalten und buchen. ' ||
    'Erstelle hier dein persönliches Konto und verwende dabei bitte diese Telefonnummer: ' || coalesce(customer_row.phone, '') || E'\n\n' || invite_url;

  if requested_channel = 'email' then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values('registration_invite', customer_row.email, customer_row.full_name,
      'Dein persönliches GiGi Beauty Konto',
      jsonb_build_object('customer_id', customer_row.id, 'content', invite_message, 'registration_url', invite_url));
  else
    insert into public.customer_communications(
      customer_id, channel, direction, communication_type, subject, content, status, occurred_at, created_by
    ) values(
      customer_row.id, requested_channel, 'outbound', 'registration_invite',
      'Einladung zum Kundenkonto', invite_message, 'planned', now(), auth.uid()
    );
  end if;

  update public.customers set
    registration_invited_at = now(), registration_invite_channel = requested_channel,
    last_contacted_at = now()
  where id = customer_row.id;

  update public.crm_tasks set
    title = 'Registrierung prüfen: ' || customer_row.full_name,
    description = 'Einladung per ' || upper(requested_channel) || ' vorbereitet. In 7 Tagen prüfen, ob das Login erstellt wurde.',
    due_at = now() + interval '7 days',
    metadata = metadata || jsonb_build_object('last_invited_at', now(), 'channel', requested_channel)
  where customer_id = customer_row.id and task_type = 'registration_invite' and status = 'open';

  return jsonb_build_object(
    'customer_id', customer_row.id,
    'channel', requested_channel,
    'phone', customer_row.phone,
    'message', invite_message,
    'registration_url', invite_url
  );
end;
$$;

create or replace function public.generate_daily_crm_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer := 0; row_count_value integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;

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
    select c.id, c.full_name, max(a.starts_at) last_visit
    from public.customers c join public.appointments a
      on c.email is not null and lower(a.customer_email) = lower(c.email)
    where a.status = 'completed' group by c.id, c.full_name
  )
  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select v.id, 'winback', 'Reaktivieren: ' || v.full_name, 'Seit mehr als 180 Tagen ohne Besuch.',
    'normal', now(), 'winback:' || v.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from visits v where v.last_visit < now() - interval '180 days'
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

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

  return inserted_count;
end;
$$;

grant execute on function public.normalized_phone(text) to authenticated;
grant execute on function public.queue_registration_invite(uuid, text) to authenticated;
